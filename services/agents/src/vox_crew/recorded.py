"""Deterministic, payload-shaped adapters for CI and local rehearsals.

Recordings contain only the normalized crew contracts, never provider response bodies.  The same
Director therefore runs in recorded and live modes without a branch in its workflow.
"""

from __future__ import annotations

import asyncio
import inspect
import json
from collections.abc import Awaitable, Callable, Mapping, Sequence
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any

from .client import ProductionClient
from .crew import ProductionExecution
from .crew_contract import (
    ArtifactHandle,
    Brief,
    Declined,
    Failed,
    Narrative,
    OperatorPolicy,
    Paused,
    ProviderMode,
    Rendered,
    ResearchDossier,
    TerminalResult,
    VisualBible,
    VisualVocabulary,
    crew_failure,
)
from .envelopes import ArtifactDescriptor, MalformedEnvelope, ResultEnvelope
from .image_generation import (
    AssetRequirement,
    ImageCandidate,
    ImageJob,
    ImageJobStatus,
    derive_generation_request,
)
from .producer import ProducedRun, produce


@dataclass(slots=True)
class RecordedResearchAdapter:
    recording: Mapping[str, Any]
    mode: ProviderMode = field(default=ProviderMode.RECORDED, init=False)
    calls: int = field(default=0, init=False)

    async def research(self, brief: Brief) -> Mapping[str, Any]:
        self.calls += 1
        return deepcopy(self.recording)


@dataclass(slots=True)
class RecordedCreativeAdapter:
    narrative_recording: Mapping[str, Any]
    visual_bible_recording: Mapping[str, Any]
    plan_recording: Mapping[str, Any]
    mode: ProviderMode = field(default=ProviderMode.RECORDED, init=False)
    narrative_calls: int = field(default=0, init=False)
    art_direction_calls: int = field(default=0, init=False)
    plan_calls: int = field(default=0, init=False)

    async def narrate(self, brief: Brief, dossier: ResearchDossier) -> Mapping[str, Any]:
        self.narrative_calls += 1
        await asyncio.sleep(0)
        return deepcopy(self.narrative_recording)

    async def art_direct(
        self, brief: Brief, dossier: ResearchDossier, vocabulary: VisualVocabulary
    ) -> Mapping[str, Any]:
        self.art_direction_calls += 1
        await asyncio.sleep(0)
        return deepcopy(self.visual_bible_recording)

    async def plan(
        self,
        brief: Brief,
        dossier: ResearchDossier,
        narrative: Narrative,
        visual_bible: VisualBible,
    ) -> Mapping[str, Any]:
        self.plan_calls += 1
        return deepcopy(self.plan_recording)


class ClientProductionAdapter:
    """Async crew adapter over the existing payload-shaped Production client seam."""

    asset_capable = True

    def __init__(
        self,
        client: ProductionClient,
        request: Mapping[str, Any],
        *,
        recording_mode: ProviderMode,
        palettes: Mapping[str, Mapping[str, str]] | None = None,
        image_decider: Callable[[ImageCandidate], bool | Awaitable[bool]] | None = None,
        image_authorisations: Mapping[str, Mapping[str, Any]] | None = None,
    ) -> None:
        self._client = client
        self._request = deepcopy(request)
        self.recording_mode = recording_mode
        self._palettes = deepcopy(palettes or {})
        self._image_decider = image_decider
        self._image_authorisations = deepcopy(image_authorisations or {})

    def set_image_decider(
        self, decision: Callable[[ImageCandidate], bool | Awaitable[bool]]
    ) -> None:
        """Installs the operator's future decisions; it never decides a candidate itself."""
        self._image_decider = decision

    async def decline(
        self, brief: Brief, summary: str, unmet_need: str, catalog_gap: str
    ) -> TerminalResult | ProductionExecution:
        requested_brief = self._request.get("brief")
        if not isinstance(requested_brief, Mapping) or requested_brief.get("id") != brief.id:
            return crew_failure(
                "PRODUCTION_BRIEF_MISMATCH",
                "Production configuration names a different Brief.",
            )
        opened = await asyncio.to_thread(self._client.init, self._request)
        if not opened.succeeded or opened.run is None:
            return self._failed_envelope(opened, "")
        run_id = opened.run.id
        envelope = await asyncio.to_thread(
            self._client.decline,
            run_id,
            {
                "protocolVersion": 1,
                "kind": "unservable_brief",
                "summary": summary,
                "unmetNeeds": [{"need": unmet_need, "catalogGap": catalog_gap}],
            },
        )
        if not envelope.succeeded and envelope.outcome != "declined":
            return self._failed_envelope(envelope, run_id)
        return ProductionExecution(
            terminal=Declined(
                run_id=run_id,
                summary=summary,
                unmet_need=unmet_need,
                catalog_gap=catalog_gap,
            ),
            state={
                "schemaVersion": 1,
                "runId": run_id,
                "requirementIds": [],
                "jobIds": {},
                "imageJobs": {},
                "commandRecords": [
                    self._envelope_record(opened),
                    self._envelope_record(envelope),
                ],
            },
            requirement_count=0,
            jobs=(),
        )

    async def produce(
        self,
        brief: Brief,
        policy: OperatorPolicy,
        plan: Mapping[str, Any],
        visual_bible: VisualBible,
        resume: Mapping[str, Any] | None,
    ) -> ProductionExecution:
        requested_brief = self._request.get("brief")
        if not isinstance(requested_brief, Mapping) or requested_brief.get("id") != brief.id:
            return ProductionExecution(
                terminal=crew_failure(
                    "PRODUCTION_BRIEF_MISMATCH",
                    "Production configuration names a different Brief.",
                ),
                state={},
                requirement_count=0,
                jobs=(),
            )
        state = dict(resume or {})
        state["commandRecords"] = list(state.get("commandRecords", []))
        state["imageJobs"] = dict(state.get("imageJobs", {}))
        run_id = state.get("runId")
        if run_id is not None and not isinstance(run_id, str):
            raise MalformedEnvelope("The saved Production Run id is malformed.")

        if run_id is None:
            run = await asyncio.to_thread(produce, self._client, self._request, plan)
            if run.refusal is not None or run.run_id is None:
                return ProductionExecution(
                    terminal=self._terminal_from_produced(run, brief),
                    state={
                        "schemaVersion": 1,
                        "runId": run.run_id,
                        "requirementIds": [],
                        "jobIds": {},
                        "imageJobs": {},
                        "commandRecords": [
                            self._envelope_record(item) for item in run.envelopes
                        ],
                    },
                    requirement_count=0,
                    jobs=(),
                )
            run_id = run.run_id
            worklist = self._worklist(run.envelopes)
            state = {
                "schemaVersion": 1,
                "runId": run_id,
                "requirementIds": [item["requirementId"] for item in worklist],
                "jobIds": {},
                "imageJobs": {},
                "commandRecords": [self._envelope_record(item) for item in run.envelopes],
            }
        else:
            raw_ids = state.get("requirementIds")
            if not isinstance(raw_ids, Sequence) or isinstance(raw_ids, (str, bytes)):
                raise MalformedEnvelope("The saved image worklist is malformed.")
            worklist = [{"requirementId": str(item)} for item in raw_ids]

        requirements = {item.requirement_id: item for item in self._requirements(plan)}
        raw_job_ids = state.get("jobIds", {})
        if not isinstance(raw_job_ids, Mapping):
            raise MalformedEnvelope("The saved image job index is malformed.")
        job_ids = {str(key): str(value) for key, value in raw_job_ids.items()}
        jobs: list[ImageJob] = []
        for item in worklist:
            requirement_id = item["requirementId"]
            requirement = requirements.get(requirement_id)
            if requirement is None:
                raise MalformedEnvelope(
                    f"Production named unknown image requirement {requirement_id}."
                )
            if not self._palettes:
                return ProductionExecution(
                    terminal=crew_failure(
                        "IMAGE_PALETTE_MISSING",
                        "No trusted palette is configured for image generation.",
                        run_id=run_id,
                    ),
                    state=state,
                    requirement_count=len(worklist),
                    jobs=tuple(jobs),
                )
            request = derive_generation_request(
                requirement,
                self._aspect_ratio(requirement.orientation),
                visual_bible,
                self._palettes,
            )
            existing_id = job_ids.get(requirement_id)
            if existing_id is None:
                authorisation = (
                    self._image_authorisations.get(policy.images.grant_id)
                    if policy.images.grant_id is not None
                    else None
                )
                envelope = await asyncio.to_thread(
                    self._client.image_start,
                    run_id,
                    request.production_mapping(requirement),
                    authorisation,
                )
            else:
                envelope = await asyncio.to_thread(
                    self._client.image_status, run_id, existing_id
                )
            self._append_envelope(state, envelope)
            if envelope.outcome == "paused":
                return ProductionExecution(
                    terminal=Paused(
                        run_id=run_id,
                        summary="Production is waiting before image generation.",
                        reason=envelope.next[0].reason if envelope.next else "Image authorization is required.",
                        resume_id=run_id,
                    ),
                    state=state,
                    requirement_count=len(worklist),
                    jobs=tuple(jobs),
                )
            if not envelope.succeeded:
                return ProductionExecution(
                    terminal=self._failed_envelope(envelope, run_id),
                    state=state,
                    requirement_count=len(worklist),
                    jobs=tuple(jobs),
                )
            job = await asyncio.to_thread(self._job_from_envelope, run_id, envelope)
            job_ids[requirement_id] = job.id
            state["jobIds"] = job_ids
            state["imageJobs"][requirement_id] = job.to_mapping()

            if job.status is ImageJobStatus.CANDIDATE:
                if self._image_decider is None:
                    jobs.append(job)
                    return ProductionExecution(
                        terminal=Paused(
                            run_id=run_id,
                            summary="An image candidate is waiting for human review.",
                            reason="Accept or reject the exact published candidate digest.",
                            resume_id=job.id,
                        ),
                        state=state,
                        requirement_count=len(worklist),
                        jobs=tuple(jobs),
                    )
                assert job.candidate is not None
                decision = self._image_decider(job.candidate)
                accepted = await decision if inspect.isawaitable(decision) else decision
                if accepted:
                    envelope = await asyncio.to_thread(
                        self._client.image_accept,
                        run_id,
                        {
                            "protocolVersion": 1,
                            "jobId": job.id,
                            "candidateSha256": job.candidate.artifact.sha256,
                        },
                    )
                else:
                    envelope = await asyncio.to_thread(
                        self._client.image_reject,
                        run_id,
                        {"protocolVersion": 1, "jobId": job.id},
                    )
                self._append_envelope(state, envelope)
                if not envelope.succeeded:
                    return ProductionExecution(
                        terminal=self._failed_envelope(envelope, run_id),
                        state=state,
                        requirement_count=len(worklist),
                        jobs=tuple([*jobs, job]),
                    )
                job = await asyncio.to_thread(self._job_from_envelope, run_id, envelope)
                state["imageJobs"][requirement_id] = job.to_mapping()
            jobs.append(job)

            if job.status in {ImageJobStatus.DISPATCHING, ImageJobStatus.UNCERTAIN}:
                return ProductionExecution(
                    terminal=Paused(
                        run_id=run_id,
                        summary="An image job has not reached a safe terminal state.",
                        reason="Observe the existing job; do not start a replacement implicitly.",
                        resume_id=job.id,
                    ),
                    state=state,
                    requirement_count=len(worklist),
                    jobs=tuple(jobs),
                )

        compiled = await asyncio.to_thread(self._client.compile, run_id)
        self._append_envelope(state, compiled)
        if not compiled.succeeded:
            return ProductionExecution(
                terminal=self._failed_envelope(compiled, run_id),
                state=state,
                requirement_count=len(worklist),
                jobs=tuple(jobs),
            )
        rendered = await asyncio.to_thread(self._client.render, run_id)
        self._append_envelope(state, rendered)
        if not rendered.succeeded:
            return ProductionExecution(
                terminal=self._failed_envelope(rendered, run_id),
                state=state,
                requirement_count=len(worklist),
                jobs=tuple(jobs),
            )
        preview_descriptor = rendered.artifact("preview")
        if preview_descriptor is None:
            raise MalformedEnvelope("run.render succeeded without a preview descriptor.")
        preview = await asyncio.to_thread(
            self._client.fetch_artifact, run_id, preview_descriptor
        )
        return ProductionExecution(
            terminal=Rendered(
                run_id=run_id,
                summary="The narrated preview is verified.",
                preview=ArtifactHandle(
                    id=f"preview:{run_id}",
                    kind=preview.kind,
                    sha256=preview.sha256,
                    media_type="video/mp4",
                    size_bytes=len(preview.data),
                ),
            ),
            state=state,
            requirement_count=len(worklist),
            jobs=tuple(jobs),
        )

    @staticmethod
    def _envelope_record(envelope: ResultEnvelope) -> Mapping[str, Any]:
        value = json.loads(envelope.raw)
        if not isinstance(value, Mapping):
            raise MalformedEnvelope("Production published a non-object envelope.")
        return deepcopy(dict(value))

    @classmethod
    def _append_envelope(cls, state: dict[str, Any], envelope: ResultEnvelope) -> None:
        records = state.get("commandRecords")
        if not isinstance(records, list):
            raise MalformedEnvelope("The saved Production command transcript is malformed.")
        records.append(cls._envelope_record(envelope))

    @staticmethod
    def _terminal_from_produced(run: ProducedRun, brief: Brief) -> TerminalResult:
        if run.refusal is not None:
            reason = (
                run.refusal.next[0].reason
                if run.refusal.next
                else "Production stopped before a preview was available."
            )
            if run.refusal.outcome in {"paused", "needs_repair"}:
                return Paused(
                    run_id=run.run_id,
                    summary="Production paused before the preview was ready.",
                    reason=reason,
                    resume_id=run.run_id or brief.id,
                )
            code = run.refusal.error.code if run.refusal.error is not None else "PRODUCTION_STOPPED"
            # Production's own refusal code, passed through rather than translated. It is not
            # the crew's to classify, so `retryable` is left unclaimed at False — see
            # `RETRYABLE_FAILURES`, which deliberately holds only codes the crew authored.
            return Failed(
                run_id=run.run_id,
                summary="Production stopped before the preview was ready.",
                code=code,
                retryable=False,
            )
        preview = run.artifact("preview")
        if run.run_id is None or preview is None:
            return crew_failure(
                "PREVIEW_MISSING",
                "Production published no preview artifact.",
                run_id=run.run_id,
            )
        return Rendered(
            run_id=run.run_id,
            summary="The narrated preview is verified.",
            preview=ArtifactHandle(
                id=f"preview:{run.run_id}",
                kind=preview.kind,
                sha256=preview.sha256,
                media_type="video/mp4",
                size_bytes=len(preview.data),
            ),
        )

    @staticmethod
    def _failed_envelope(envelope: ResultEnvelope, run_id: str) -> Failed | Paused:
        if envelope.outcome in {"paused", "needs_repair"}:
            return Paused(
                run_id=run_id,
                summary="Production paused before the preview was ready.",
                reason=envelope.next[0].reason if envelope.next else "Production requires operator action.",
                resume_id=run_id,
            )
        # Production's refusal code again, and unclaimed for the same reason as above.
        return Failed(
            run_id=run_id,
            summary="Production stopped before the preview was ready.",
            code=envelope.error.code if envelope.error else "PRODUCTION_STOPPED",
            retryable=False,
        )

    @staticmethod
    def _worklist(envelopes: Sequence[ResultEnvelope]) -> list[dict[str, str]]:
        compiled = next(
            (item for item in reversed(envelopes) if item.command == "run.compile"), None
        )
        raw = compiled.data.get("assetWorklist") if compiled and compiled.data else None
        if not isinstance(raw, list):
            raise MalformedEnvelope("run.compile published no structured asset worklist.")
        result: list[dict[str, str]] = []
        for item in raw:
            if not isinstance(item, Mapping) or not isinstance(item.get("requirementId"), str):
                raise MalformedEnvelope("run.compile published a malformed asset work item.")
            result.append({"requirementId": item["requirementId"]})
        return result

    @staticmethod
    def _requirements(plan: Mapping[str, Any]) -> tuple[AssetRequirement, ...]:
        values: list[Mapping[str, Any]] = []
        sections = plan.get("sections")
        if not isinstance(sections, list):
            raise MalformedEnvelope("VideoPlan sections are malformed.")
        for section in sections:
            if not isinstance(section, Mapping):
                raise MalformedEnvelope("A VideoPlan section is malformed.")
            for scene in section.get("scenes", []):
                if isinstance(scene, Mapping) and isinstance(scene.get("props"), Mapping):
                    value = scene["props"].get("assetRequirement")
                    if isinstance(value, Mapping):
                        values.append(value)
            for element in section.get("persistent", []):
                if isinstance(element, Mapping) and isinstance(
                    element.get("assetRequirement"), Mapping
                ):
                    values.append(element["assetRequirement"])
        return tuple(AssetRequirement.from_mapping(value) for value in values)

    @staticmethod
    def _aspect_ratio(orientation: str) -> str:
        return {"landscape": "16:9", "portrait": "9:16", "square": "1:1"}[orientation]

    def _job_from_envelope(self, run_id: str, envelope: ResultEnvelope) -> ImageJob:
        value = envelope.data.get("job") if envelope.data else None
        if not isinstance(value, Mapping):
            raise MalformedEnvelope("The image command published no job.")
        candidate = value.get("candidate")
        normalized_candidate: Mapping[str, Any] | None = None
        if candidate is not None:
            if not isinstance(candidate, Mapping) or not isinstance(candidate.get("artifact"), Mapping):
                raise MalformedEnvelope("The image command published a malformed candidate.")
            raw_artifact = candidate["artifact"]
            descriptor = ArtifactDescriptor(
                kind=str(raw_artifact.get("kind")),
                path=str(raw_artifact.get("path")),
                sha256=str(raw_artifact.get("sha256")),
            )
            artifact = self._client.fetch_artifact(run_id, descriptor)
            normalized_candidate = {
                **{key: item for key, item in candidate.items() if key != "artifact"},
                "artifact": {
                    "id": str(candidate.get("id")),
                    "kind": artifact.kind,
                    "sha256": artifact.sha256,
                    "mediaType": "image/png",
                    "sizeBytes": len(artifact.data),
                },
            }
        return ImageJob.from_mapping(
            {
                **{key: item for key, item in value.items() if key != "candidate"},
                "candidate": normalized_candidate,
            }
        )


__all__ = [
    "ClientProductionAdapter",
    "RecordedCreativeAdapter",
    "RecordedResearchAdapter",
]
