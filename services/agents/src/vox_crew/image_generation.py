"""Deterministic image requests around a resumable, explicitly authorized provider call.

Provider bytes stay inside the job store. Public state carries only a content-bound artifact
handle, dimensions and safe status. Starting and observing are separate operations: an uncertain
dispatch is reported and never converted into an automatic second paid call.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from collections.abc import Callable, Mapping, Sequence
from copy import deepcopy
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from enum import Enum
from typing import Any, Protocol

from .crew_contract import (
    ArtifactHandle,
    ContractViolation,
    ProviderAccess,
    ProviderMode,
    VisualBible,
)


ASPECT_RATIOS = frozenset({"1:1", "3:4", "4:3", "9:16", "16:9"})
ASSET_TYPES = frozenset({"image", "character", "map", "document"})
ASSET_TREATMENTS = frozenset({"photo", "cutout", "illustration", "duotone"})
ASSET_ORIENTATIONS = frozenset({"landscape", "portrait", "square"})


def _object(value: Any, what: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ContractViolation(f"{what} must be an object.")
    return value


def _strict(value: Mapping[str, Any], allowed: set[str], what: str) -> None:
    unknown = sorted(set(value) - allowed)
    if unknown:
        raise ContractViolation(f"{what} has unknown fields: {', '.join(unknown)}.")


def _text(value: Any, what: str, *, maximum: int | None = None) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ContractViolation(f"{what} must be a non-empty string.")
    if maximum is not None and len(value) > maximum:
        raise ContractViolation(f"{what} must be at most {maximum} characters.")
    return value


def _sha(value: Any, what: str) -> str:
    value = _text(value, what)
    if len(value) != 64 or any(character not in "0123456789abcdef" for character in value):
        raise ContractViolation(f"{what} must be a lowercase SHA-256 digest.")
    return value


def _canonical_digest(value: Mapping[str, Any]) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    return hashlib.sha256(encoded).hexdigest()


def _purpose_digest(purpose: str, value: Mapping[str, Any]) -> str:
    return _canonical_digest({"protocolVersion": 1, "purpose": purpose, "value": value})


@dataclass(frozen=True, slots=True)
class AssetRequirement:
    type: str
    subject: str
    treatment: str
    orientation: str
    identity_key: str | None = None

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> AssetRequirement:
        value = _object(value, "asset requirement")
        _strict(
            value,
            {"type", "subject", "treatment", "orientation", "identityKey"},
            "asset requirement",
        )
        asset_type = _text(value.get("type"), "asset requirement.type")
        treatment = _text(value.get("treatment"), "asset requirement.treatment")
        orientation = _text(value.get("orientation"), "asset requirement.orientation")
        if asset_type not in ASSET_TYPES:
            raise ContractViolation("asset requirement.type is not published.")
        if treatment not in ASSET_TREATMENTS:
            raise ContractViolation("asset requirement.treatment is not published.")
        if orientation not in ASSET_ORIENTATIONS:
            raise ContractViolation("asset requirement.orientation is not published.")
        identity = value.get("identityKey")
        if identity is not None:
            identity = _text(identity, "asset requirement.identityKey", maximum=80)
        return cls(
            type=asset_type,
            subject=_text(value.get("subject"), "asset requirement.subject", maximum=80),
            treatment=treatment,
            orientation=orientation,
            identity_key=identity,
        )

    def to_mapping(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "subject": self.subject,
            "treatment": self.treatment,
            "orientation": self.orientation,
            **({"identityKey": self.identity_key} if self.identity_key is not None else {}),
        }

    @property
    def requirement_id(self) -> str:
        identity = (
            f"identity|{self.identity_key}"
            if self.identity_key is not None
            else "|".join(
                (
                    "semantic",
                    self.type,
                    self.subject.strip().lower(),
                    self.treatment,
                    self.orientation,
                )
            )
        )
        value = 0x811C9DC5
        units = identity.encode("utf-16-le")
        for index in range(0, len(units), 2):
            value ^= int.from_bytes(units[index : index + 2], "little")
            value = (value * 0x01000193) & 0xFFFFFFFF
        return f"req_{value:08x}"

    @property
    def identity(self) -> str:
        return self.identity_key or self.requirement_id


@dataclass(frozen=True, slots=True)
class GenerationRequest:
    prompt: str
    aspect_ratio: str
    output_mime_type: str
    seed: int
    request_sha256: str

    def provider_mapping(self) -> dict[str, Any]:
        return {
            "prompt": self.prompt,
            "aspectRatio": self.aspect_ratio,
            "outputMimeType": self.output_mime_type,
            "seed": self.seed,
        }

    def production_mapping(self, requirement: AssetRequirement) -> dict[str, Any]:
        return {
            "protocolVersion": 1,
            "requirementId": requirement.requirement_id,
            "identityKey": requirement.identity,
            **self.provider_mapping(),
            "requestSha256": self.request_sha256,
        }


def derive_generation_request(
    requirement: AssetRequirement,
    aspect_ratio: str,
    visual_bible: VisualBible,
    palettes: Mapping[str, Mapping[str, str]],
) -> GenerationRequest:
    """Derive the complete provider prompt without accepting agent-authored style prose."""
    if aspect_ratio not in ASPECT_RATIOS:
        raise ContractViolation("Image aspect ratio is not published.")
    palette = palettes.get(visual_bible.theme)
    if palette is None:
        raise ContractViolation("The Visual bible theme has no trusted palette.")
    selected_colors: list[str] = []
    for role in visual_bible.color_roles:
        color = palette.get(role)
        if color is None or not isinstance(color, str):
            raise ContractViolation(f'The trusted palette has no color role "{role}".')
        selected_colors.append(f"{role}={color.lower()}")

    prompt = "\n".join(
        (
            "VOX_IMAGE_REQUEST_V1",
            f"Subject: {requirement.subject}",
            f"Material: {requirement.type}",
            f"Editorial treatment: {requirement.treatment}",
            f"Composition: {requirement.orientation}, target aspect ratio {aspect_ratio}",
            f"Design theme: {visual_bible.theme}",
            f"Treatment family: {', '.join(visual_bible.treatments)}",
            f"Palette: {', '.join(selected_colors)}",
            (
                "Exclude treatment families: "
                + (", ".join(visual_bible.forbidden_treatments) or "none")
            ),
            "Keep the principal subject inside the central safe crop; include no text or watermark.",
        )
    )
    provisional = {
        "prompt": prompt,
        "aspectRatio": aspect_ratio,
        "outputMimeType": "image/png",
    }
    digest = _canonical_digest(provisional)
    seed = int(digest[:8], 16) & 0x7FFFFFFF
    final = {**provisional, "seed": seed}
    return GenerationRequest(
        prompt,
        aspect_ratio,
        "image/png",
        seed,
        _purpose_digest("image-generation-request", final),
    )


@dataclass(frozen=True, slots=True)
class GeneratedImage:
    bytes: bytes
    media_type: str


class ImageGenerationAdapter(Protocol):
    mode: ProviderMode

    async def generate(self, request: GenerationRequest) -> GeneratedImage: ...


@dataclass(slots=True)
class RecordedImageAdapter:
    image_bytes: bytes
    media_type: str
    mode: ProviderMode = ProviderMode.RECORDED
    calls: int = field(default=0, init=False)

    async def generate(self, request: GenerationRequest) -> GeneratedImage:
        self.calls += 1
        await asyncio.sleep(0)
        return GeneratedImage(bytes(self.image_bytes), self.media_type)


#: There is deliberately no live image adapter on this side of the seam.
#:
#: ADR-0007: the Production service alone owns credentials, and only its `record` operation
#: may use outbound network or quota. A `GoogleImagenAdapter` lived here, read `GOOGLE_API_KEY`
#: and called the provider from inside the agent-readable environment. Nothing constructed it
#: outside its own test — `ProductionCrew` reaches image generation through
#: `ProductionAdapter.produce` — so it bought nothing and stood ready to break the isolation
#: guarantee the architecture rests on. The live call lives in `packages/production/src/image/
#: google.ts`, which is also where its model pin belongs.


class ImageJobStatus(str, Enum):
    DISPATCHING = "dispatching"
    CANDIDATE = "candidate"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    FAILED = "failed"
    UNCERTAIN = "uncertain"


@dataclass(frozen=True, slots=True)
class ImageCandidate:
    id: str
    identity_key: str
    requirement_id: str
    prompt_sha256: str
    artifact: ArtifactHandle
    width: int
    height: int

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> ImageCandidate:
        value = _object(value, "image candidate")
        _strict(
            value,
            {
                "id",
                "identityKey",
                "requirementId",
                "promptSha256",
                "artifact",
                "width",
                "height",
            },
            "image candidate",
        )
        width = value.get("width")
        height = value.get("height")
        if (
            isinstance(width, bool)
            or not isinstance(width, int)
            or width <= 0
            or isinstance(height, bool)
            or not isinstance(height, int)
            or height <= 0
        ):
            raise ContractViolation("image candidate dimensions must be positive integers.")
        return cls(
            id=_text(value.get("id"), "image candidate.id"),
            identity_key=_text(value.get("identityKey"), "image candidate.identityKey"),
            requirement_id=_text(value.get("requirementId"), "image candidate.requirementId"),
            prompt_sha256=_sha(value.get("promptSha256"), "image candidate.promptSha256"),
            artifact=ArtifactHandle.from_mapping(value.get("artifact")),
            width=width,
            height=height,
        )

    def to_mapping(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "identityKey": self.identity_key,
            "requirementId": self.requirement_id,
            "promptSha256": self.prompt_sha256,
            "artifact": self.artifact.to_mapping(),
            "width": self.width,
            "height": self.height,
        }


@dataclass(frozen=True, slots=True)
class ImageJob:
    id: str
    requirement_id: str
    identity_key: str
    request_sha256: str
    provider_mode: ProviderMode
    status: ImageJobStatus
    candidate: ImageCandidate | None = None
    failure: str | None = None

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> ImageJob:
        value = _object(value, "image job")
        _strict(
            value,
            {
                "schemaVersion",
                "id",
                "requirementId",
                "identityKey",
                "requestSha256",
                "providerMode",
                "status",
                "candidate",
                "failure",
            },
            "image job",
        )
        if value.get("schemaVersion") != 1:
            raise ContractViolation("image job.schemaVersion must be 1.")
        try:
            status = ImageJobStatus(value.get("status"))
        except (TypeError, ValueError) as error:
            raise ContractViolation("image job.status is not published.") from error
        try:
            provider_mode = ProviderMode(value.get("providerMode"))
        except (TypeError, ValueError) as error:
            raise ContractViolation("image job.providerMode is not published.") from error
        if provider_mode not in {ProviderMode.RECORDED, ProviderMode.LIVE}:
            raise ContractViolation("image job.providerMode must be recorded or live.")
        candidate_value = value.get("candidate")
        candidate = (
            None
            if candidate_value is None
            else ImageCandidate.from_mapping(_object(candidate_value, "image job.candidate"))
        )
        failure = value.get("failure")
        if failure is not None:
            failure = _text(failure, "image job.failure")
        if status in {ImageJobStatus.CANDIDATE, ImageJobStatus.ACCEPTED, ImageJobStatus.REJECTED}:
            if candidate is None or failure is not None:
                raise ContractViolation("candidate image states require candidate metadata only.")
        elif candidate is not None:
            raise ContractViolation("non-candidate image states cannot carry a candidate.")
        if status in {ImageJobStatus.FAILED, ImageJobStatus.UNCERTAIN}:
            if failure is None:
                raise ContractViolation("failed image states require a safe failure summary.")
        elif failure is not None:
            raise ContractViolation("non-failed image states cannot carry a failure summary.")
        return cls(
            id=_text(value.get("id"), "image job.id"),
            requirement_id=_text(value.get("requirementId"), "image job.requirementId"),
            identity_key=_text(value.get("identityKey"), "image job.identityKey"),
            request_sha256=_sha(value.get("requestSha256"), "image job.requestSha256"),
            provider_mode=provider_mode,
            status=status,
            candidate=candidate,
            failure=failure,
        )

    def to_mapping(self) -> dict[str, Any]:
        return {
            "schemaVersion": 1,
            "id": self.id,
            "requirementId": self.requirement_id,
            "identityKey": self.identity_key,
            "requestSha256": self.request_sha256,
            "providerMode": self.provider_mode.value,
            "status": self.status.value,
            "candidate": None if self.candidate is None else self.candidate.to_mapping(),
            "failure": self.failure,
        }


@dataclass(frozen=True, slots=True)
class ImageGrant:
    id: str
    request_sha256: str
    expires_at: datetime

    def __post_init__(self) -> None:
        _text(self.id, "image grant.id")
        _sha(self.request_sha256, "image grant.requestSha256")
        if self.expires_at.tzinfo is None:
            raise ContractViolation("image grant.expiresAt must carry a timezone.")


class ImageGrantLedger:
    """Single-use, request-bound grants; image spend is separate from recording quota."""

    def __init__(
        self,
        grants: Sequence[ImageGrant] = (),
        *,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._grants = {grant.id: grant for grant in grants}
        self._consumed: set[str] = set()
        self._now = now
        self._lock = asyncio.Lock()

    async def consume(self, grant_id: str, request_sha256: str) -> None:
        async with self._lock:
            grant = self._grants.get(grant_id)
            if (
                grant is None
                or grant.id in self._consumed
                or grant.request_sha256 != request_sha256
                or grant.expires_at <= self._now()
            ):
                raise ContractViolation("Image authorization grant is invalid or already consumed.")
            self._consumed.add(grant.id)


@dataclass(slots=True)
class _StoredJob:
    public: ImageJob
    requirement: AssetRequirement
    request: GenerationRequest
    candidate_bytes: bytes | None = None


class ImageJobStore(Protocol):
    async def by_identity(self, identity_key: str) -> _StoredJob | None: ...

    async def reserve(self, job: _StoredJob) -> tuple[_StoredJob, bool]: ...

    async def update(self, job: _StoredJob) -> None: ...

    async def get(self, job_id: str) -> _StoredJob: ...


class InMemoryImageJobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, _StoredJob] = {}
        self._identities: dict[str, str] = {}
        self._lock = asyncio.Lock()

    async def by_identity(self, identity_key: str) -> _StoredJob | None:
        async with self._lock:
            job_id = self._identities.get(identity_key)
            return None if job_id is None else deepcopy(self._jobs[job_id])

    async def reserve(self, job: _StoredJob) -> tuple[_StoredJob, bool]:
        async with self._lock:
            existing_id = self._identities.get(job.public.identity_key)
            if existing_id is not None:
                return deepcopy(self._jobs[existing_id]), False
            self._jobs[job.public.id] = deepcopy(job)
            self._identities[job.public.identity_key] = job.public.id
            return deepcopy(job), True

    async def update(self, job: _StoredJob) -> None:
        async with self._lock:
            if job.public.id not in self._jobs:
                raise ContractViolation("Image job does not exist.")
            self._jobs[job.public.id] = deepcopy(job)

    async def get(self, job_id: str) -> _StoredJob:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise ContractViolation("Image job does not exist.")
            return deepcopy(job)


class ImageJobCoordinator:
    """Own identity, authorization, durable dispatch state, validation and acceptance."""

    def __init__(
        self,
        adapter: ImageGenerationAdapter,
        store: ImageJobStore,
        *,
        grants: ImageGrantLedger | None = None,
    ) -> None:
        self._adapter = adapter
        self._store = store
        self._grants = grants

    async def start(
        self,
        requirement: AssetRequirement,
        request: GenerationRequest,
        access: ProviderAccess,
    ) -> ImageJob:
        if access.mode is not self._adapter.mode:
            raise ContractViolation("Image provider mode does not match operator policy.")
        existing = await self._store.by_identity(requirement.identity)
        if existing is not None:
            return existing.public
        access.require_authorized("images")
        if access.mode is ProviderMode.LIVE:
            if access.grant_id is None or self._grants is None:
                raise ContractViolation("Live image generation requires a verified authorization grant.")
            await self._grants.consume(access.grant_id, request.request_sha256)

        job_id = "image-job-" + _purpose_digest(
            "image-job",
            {"identityKey": requirement.identity, "requestSha256": request.request_sha256}
        )[:20]
        public = ImageJob(
            id=job_id,
            requirement_id=requirement.requirement_id,
            identity_key=requirement.identity,
            request_sha256=request.request_sha256,
            provider_mode=self._adapter.mode,
            status=ImageJobStatus.DISPATCHING,
        )
        stored, created = await self._store.reserve(_StoredJob(public, requirement, request))
        if not created:
            return stored.public

        try:
            generated = await self._adapter.generate(request)
            width, height = _image_dimensions(generated.bytes, generated.media_type)
            digest = hashlib.sha256(generated.bytes).hexdigest()
            # Separator and digest length match the Production service, which is the
            # authority for a candidate id (`service.ts`, `image-candidate-${sha.slice(0, 20)}`).
            # A colon here minted ids no Run could ever contain.
            candidate_id = "image-candidate-" + digest[:20]
            candidate = ImageCandidate(
                id=candidate_id,
                identity_key=requirement.identity,
                requirement_id=requirement.requirement_id,
                prompt_sha256=hashlib.sha256(request.prompt.encode()).hexdigest(),
                artifact=ArtifactHandle(
                    id=candidate_id,
                    kind="generated_image",
                    sha256=digest,
                    media_type=generated.media_type,
                    size_bytes=len(generated.bytes),
                ),
                width=width,
                height=height,
            )
            stored = replace(
                stored,
                public=replace(stored.public, status=ImageJobStatus.CANDIDATE, candidate=candidate),
                candidate_bytes=bytes(generated.bytes),
            )
        except asyncio.CancelledError:
            stored = replace(
                stored,
                public=replace(
                    stored.public,
                    status=ImageJobStatus.UNCERTAIN,
                    failure="Image dispatch outcome is uncertain; observe this job before any replacement.",
                ),
            )
            await self._store.update(stored)
            raise
        except Exception:
            stored = replace(
                stored,
                public=replace(
                    stored.public,
                    status=ImageJobStatus.FAILED,
                    failure="Image generation did not produce a valid candidate.",
                ),
            )
        await self._store.update(stored)
        return stored.public

    async def observe(self, job_id: str) -> ImageJob:
        return (await self._store.get(job_id)).public

    async def accept(self, job_id: str, candidate_sha256: str) -> ImageJob:
        stored = await self._store.get(job_id)
        candidate = stored.public.candidate
        if stored.public.status is not ImageJobStatus.CANDIDATE or candidate is None:
            raise ContractViolation("Only an inspectable image candidate can be accepted.")
        if candidate.artifact.sha256 != _sha(candidate_sha256, "candidate digest"):
            raise ContractViolation("Candidate acceptance must bind the exact digest.")
        stored.public = replace(stored.public, status=ImageJobStatus.ACCEPTED)
        await self._store.update(stored)
        return stored.public

    async def reject(self, job_id: str) -> ImageJob:
        stored = await self._store.get(job_id)
        if stored.public.status is not ImageJobStatus.CANDIDATE:
            raise ContractViolation("Only an inspectable image candidate can be rejected.")
        stored.public = replace(stored.public, status=ImageJobStatus.REJECTED)
        await self._store.update(stored)
        return stored.public


def _image_dimensions(data: bytes, media_type: str) -> tuple[int, int]:
    if media_type != "image/png":
        raise ContractViolation("Generated image media type must be image/png.")
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise ContractViolation("Generated image bytes are not a PNG.")
    width = int.from_bytes(data[16:20], "big")
    height = int.from_bytes(data[20:24], "big")
    if width <= 0 or height <= 0:
        raise ContractViolation("Generated image dimensions are invalid.")
    return width, height


__all__ = [
    "AssetRequirement",
    "GeneratedImage",
    "GenerationRequest",
    "ImageCandidate",
    "ImageGenerationAdapter",
    "ImageGrant",
    "ImageGrantLedger",
    "ImageJob",
    "ImageJobCoordinator",
    "ImageJobStatus",
    "ImageJobStore",
    "InMemoryImageJobStore",
    "RecordedImageAdapter",
    "derive_generation_request",
]
