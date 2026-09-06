"""The one public contract of the production crew.

The contract is deliberately independent of ADK, providers, Production transports and files.
A Web caller and a recorded test consume the same values: ordered phase events followed by one
explicit terminal result.  Constructors parse untrusted adapter/model output strictly; dataclass
instances therefore represent values that have already crossed their owning schema gate.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from enum import Enum
from typing import Any


SCHEMA_VERSION = 1
SHA256 = re.compile(r"^[0-9a-f]{64}$")
SAFE_NAME = re.compile(r"^[a-z][A-Za-z0-9_.:-]*$")
DISCLOSURE = re.compile(
    r"(?i)(?:api[_-]?key|password|credential|bearer\s+|sk-[a-z0-9_-]+|"
    r"-----BEGIN|[a-z]:\\|/(?:users|home|var|tmp)/|\.tsx?\b|\.py\b)"
)


class ContractViolation(ValueError):
    """An untrusted value does not satisfy the crew's published contract."""


class BriefKind(str, Enum):
    FACTUAL = "factual"
    FICTIONAL = "fictional"
    TEST_DATA = "test_data"


class ProviderMode(str, Enum):
    RECORDED = "recorded"
    LIVE = "live"
    DISABLED = "disabled"
    NOT_APPLICABLE = "not_applicable"


class CrewPhase(str, Enum):
    RESEARCH = "research"
    NARRATIVE = "narrative"
    ART_DIRECTION = "art_direction"
    VISUAL_PLANNING = "visual_planning"
    ASSET_RESOLUTION = "asset_resolution"
    IMAGE_CREATION = "image_creation"
    PRODUCTION = "production"
    ARTIFACT_RETRIEVAL = "artifact_retrieval"


class CrewRole(str, Enum):
    DIRECTOR = "director"
    RESEARCH_AGENT = "research_agent"
    NARRATIVE_AGENT = "narrative_agent"
    ART_DIRECTOR_AGENT = "art_director_agent"
    VISUAL_PLANNER = "visual_planner"
    ASSET_RESOLVER = "asset_resolver"
    IMAGE_CREATOR_AGENT = "image_creator_agent"


class PhaseStatus(str, Enum):
    STARTED = "started"
    COMPLETED = "completed"
    SKIPPED = "skipped"
    PAUSED = "paused"
    FAILED = "failed"


class ResearchMode(str, Enum):
    RESEARCHED = "researched"
    NOT_REQUIRED = "not_required"


class EvidenceSupport(str, Enum):
    SUPPORTED = "supported"
    UNCERTAIN = "uncertain"
    CONTRADICTED = "contradicted"


PHASE_ROLES: dict[CrewPhase, frozenset[CrewRole]] = {
    CrewPhase.RESEARCH: frozenset({CrewRole.RESEARCH_AGENT, CrewRole.DIRECTOR}),
    CrewPhase.NARRATIVE: frozenset({CrewRole.NARRATIVE_AGENT}),
    CrewPhase.ART_DIRECTION: frozenset({CrewRole.ART_DIRECTOR_AGENT}),
    CrewPhase.VISUAL_PLANNING: frozenset({CrewRole.VISUAL_PLANNER, CrewRole.DIRECTOR}),
    CrewPhase.ASSET_RESOLUTION: frozenset({CrewRole.ASSET_RESOLVER, CrewRole.DIRECTOR}),
    CrewPhase.IMAGE_CREATION: frozenset({CrewRole.IMAGE_CREATOR_AGENT, CrewRole.DIRECTOR}),
    CrewPhase.PRODUCTION: frozenset({CrewRole.DIRECTOR}),
    CrewPhase.ARTIFACT_RETRIEVAL: frozenset({CrewRole.DIRECTOR}),
}


def _mapping(value: Any, what: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ContractViolation(f"{what} must be an object.")
    return value


def _strict(value: Mapping[str, Any], allowed: set[str], what: str) -> None:
    unknown = sorted(set(value) - allowed)
    if unknown:
        raise ContractViolation(f"{what} has unknown fields: {', '.join(unknown)}.")


def _required_string(value: Mapping[str, Any], key: str, what: str) -> str:
    item = value.get(key)
    if not isinstance(item, str) or not item.strip():
        raise ContractViolation(f"{what}.{key} must be a non-empty string.")
    return item


def _optional_string(value: Mapping[str, Any], key: str, what: str) -> str | None:
    item = value.get(key)
    if item is not None and (not isinstance(item, str) or not item.strip()):
        raise ContractViolation(f"{what}.{key} must be null or a non-empty string.")
    return item


def _enum(enum: type[Enum], value: Any, what: str) -> Any:
    try:
        return enum(value)
    except (TypeError, ValueError) as error:
        choices = ", ".join(str(item.value) for item in enum)
        raise ContractViolation(f"{what} must be one of: {choices}.") from error


def _positive_integer(value: Any, what: str, *, zero: bool = False) -> int:
    floor = 0 if zero else 1
    if isinstance(value, bool) or not isinstance(value, int) or value < floor:
        qualifier = "non-negative" if zero else "positive"
        raise ContractViolation(f"{what} must be a {qualifier} integer.")
    return value


def _safe_summary(value: Mapping[str, Any], key: str, what: str) -> str:
    summary = _required_string(value, key, what)
    if DISCLOSURE.search(summary):
        raise ContractViolation(f"{what}.{key} must be a safe summary without secrets or paths.")
    return summary


def _safe_public_text(value: Mapping[str, Any], key: str, what: str) -> str:
    text = _required_string(value, key, what)
    if DISCLOSURE.search(text):
        raise ContractViolation(f"{what}.{key} must be safe public text without secrets or paths.")
    return text


def _array(value: Mapping[str, Any], key: str, what: str) -> Sequence[Any]:
    item = value.get(key)
    if isinstance(item, (str, bytes)) or not isinstance(item, Sequence):
        raise ContractViolation(f"{what}.{key} must be an array.")
    return item


def _strings(
    value: Mapping[str, Any], key: str, what: str, *, allow_empty: bool = True
) -> tuple[str, ...]:
    items = _array(value, key, what)
    result: list[str] = []
    for index, item in enumerate(items):
        if not isinstance(item, str) or not item.strip():
            raise ContractViolation(f"{what}.{key}[{index}] must be a non-empty string.")
        result.append(item)
    if not allow_empty and not result:
        raise ContractViolation(f"{what}.{key} must not be empty.")
    return tuple(result)


def _unique(values: Sequence[str], what: str) -> None:
    if len(values) != len(set(values)):
        raise ContractViolation(f"{what} must use unique identifiers.")


@dataclass(frozen=True, slots=True)
class Brief:
    id: str
    text: str
    kind: BriefKind

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> Brief:
        value = _mapping(value, "brief")
        _strict(value, {"id", "text", "kind"}, "brief")
        return cls(
            id=_required_string(value, "id", "brief"),
            text=_required_string(value, "text", "brief"),
            kind=_enum(BriefKind, value.get("kind"), "brief.kind"),
        )

    def to_mapping(self) -> dict[str, Any]:
        return {"id": self.id, "text": self.text, "kind": self.kind.value}


@dataclass(frozen=True, slots=True)
class ResearchSource:
    id: str
    title: str
    url: str

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> ResearchSource:
        value = _mapping(value, "research source")
        _strict(value, {"id", "title", "url"}, "research source")
        url = _required_string(value, "url", "research source")
        if not url.startswith(("https://", "http://")):
            raise ContractViolation("research source.url must be an HTTP(S) source location.")
        return cls(
            id=_required_string(value, "id", "research source"),
            title=_required_string(value, "title", "research source"),
            url=url,
        )

    def to_mapping(self) -> dict[str, Any]:
        return {"id": self.id, "title": self.title, "url": self.url}


@dataclass(frozen=True, slots=True)
class SourcedClaim:
    id: str
    text: str
    source_ids: tuple[str, ...]
    support: EvidenceSupport

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any], what: str = "research claim") -> SourcedClaim:
        value = _mapping(value, what)
        _strict(value, {"id", "text", "sourceIds", "support"}, what)
        return cls(
            id=_required_string(value, "id", what),
            text=_required_string(value, "text", what),
            source_ids=_strings(value, "sourceIds", what, allow_empty=False),
            support=_enum(EvidenceSupport, value.get("support"), f"{what}.support"),
        )

    def to_mapping(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "text": self.text,
            "sourceIds": list(self.source_ids),
            "support": self.support.value,
        }


@dataclass(frozen=True, slots=True)
class SourcedStatistic:
    id: str
    text: str
    value: str
    unit: str | None
    source_ids: tuple[str, ...]
    support: EvidenceSupport

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> SourcedStatistic:
        value = _mapping(value, "research statistic")
        _strict(value, {"id", "text", "value", "unit", "sourceIds", "support"}, "research statistic")
        return cls(
            id=_required_string(value, "id", "research statistic"),
            text=_required_string(value, "text", "research statistic"),
            value=_required_string(value, "value", "research statistic"),
            unit=_optional_string(value, "unit", "research statistic"),
            source_ids=_strings(value, "sourceIds", "research statistic", allow_empty=False),
            support=_enum(EvidenceSupport, value.get("support"), "research statistic.support"),
        )

    def to_mapping(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "text": self.text,
            "value": self.value,
            "unit": self.unit,
            "sourceIds": list(self.source_ids),
            "support": self.support.value,
        }


@dataclass(frozen=True, slots=True)
class SourcedQuotation:
    id: str
    text: str
    attribution: str
    source_ids: tuple[str, ...]
    support: EvidenceSupport

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> SourcedQuotation:
        value = _mapping(value, "research quotation")
        _strict(value, {"id", "text", "attribution", "sourceIds", "support"}, "research quotation")
        return cls(
            id=_required_string(value, "id", "research quotation"),
            text=_required_string(value, "text", "research quotation"),
            attribution=_required_string(value, "attribution", "research quotation"),
            source_ids=_strings(value, "sourceIds", "research quotation", allow_empty=False),
            support=_enum(EvidenceSupport, value.get("support"), "research quotation.support"),
        )

    def to_mapping(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "text": self.text,
            "attribution": self.attribution,
            "sourceIds": list(self.source_ids),
            "support": self.support.value,
        }


@dataclass(frozen=True, slots=True)
class ResearchContradiction:
    id: str
    summary: str
    claim_ids: tuple[str, ...]

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> ResearchContradiction:
        value = _mapping(value, "research contradiction")
        _strict(value, {"id", "summary", "claimIds"}, "research contradiction")
        return cls(
            id=_required_string(value, "id", "research contradiction"),
            summary=_required_string(value, "summary", "research contradiction"),
            claim_ids=_strings(value, "claimIds", "research contradiction", allow_empty=False),
        )

    def to_mapping(self) -> dict[str, Any]:
        return {"id": self.id, "summary": self.summary, "claimIds": list(self.claim_ids)}


@dataclass(frozen=True, slots=True)
class VisualOpportunity:
    id: str
    description: str
    claim_ids: tuple[str, ...]

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> VisualOpportunity:
        value = _mapping(value, "visual opportunity")
        _strict(value, {"id", "description", "claimIds"}, "visual opportunity")
        return cls(
            id=_required_string(value, "id", "visual opportunity"),
            description=_required_string(value, "description", "visual opportunity"),
            claim_ids=_strings(value, "claimIds", "visual opportunity", allow_empty=False),
        )

    def to_mapping(self) -> dict[str, Any]:
        return {"id": self.id, "description": self.description, "claimIds": list(self.claim_ids)}


@dataclass(frozen=True, slots=True)
class ResearchDossier:
    mode: ResearchMode
    sources: tuple[ResearchSource, ...]
    claims: tuple[SourcedClaim, ...]
    statistics: tuple[SourcedStatistic, ...]
    quotations: tuple[SourcedQuotation, ...]
    contradictions: tuple[ResearchContradiction, ...]
    visual_opportunities: tuple[VisualOpportunity, ...]

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> ResearchDossier:
        value = _mapping(value, "research dossier")
        _strict(
            value,
            {
                "schemaVersion",
                "mode",
                "sources",
                "claims",
                "statistics",
                "quotations",
                "contradictions",
                "visualOpportunities",
            },
            "research dossier",
        )
        if value.get("schemaVersion") != SCHEMA_VERSION:
            raise ContractViolation(f"research dossier.schemaVersion must be {SCHEMA_VERSION}.")
        dossier = cls(
            mode=_enum(ResearchMode, value.get("mode"), "research dossier.mode"),
            sources=tuple(
                ResearchSource.from_mapping(item) for item in _array(value, "sources", "research dossier")
            ),
            claims=tuple(
                SourcedClaim.from_mapping(item) for item in _array(value, "claims", "research dossier")
            ),
            statistics=tuple(
                SourcedStatistic.from_mapping(item)
                for item in _array(value, "statistics", "research dossier")
            ),
            quotations=tuple(
                SourcedQuotation.from_mapping(item)
                for item in _array(value, "quotations", "research dossier")
            ),
            contradictions=tuple(
                ResearchContradiction.from_mapping(item)
                for item in _array(value, "contradictions", "research dossier")
            ),
            visual_opportunities=tuple(
                VisualOpportunity.from_mapping(item)
                for item in _array(value, "visualOpportunities", "research dossier")
            ),
        )
        source_ids = tuple(item.id for item in dossier.sources)
        claim_ids = tuple(item.id for item in dossier.claims)
        all_ids = (
            *source_ids,
            *claim_ids,
            *(item.id for item in dossier.statistics),
            *(item.id for item in dossier.quotations),
            *(item.id for item in dossier.contradictions),
            *(item.id for item in dossier.visual_opportunities),
        )
        _unique(all_ids, "research dossier")
        known_sources = set(source_ids)
        for item in (*dossier.claims, *dossier.statistics, *dossier.quotations):
            unknown = sorted(set(item.source_ids) - known_sources)
            if unknown:
                raise ContractViolation(f"research dossier cites unknown source: {', '.join(unknown)}.")
        known_claims = set(claim_ids)
        for item in (*dossier.contradictions, *dossier.visual_opportunities):
            unknown = sorted(set(item.claim_ids) - known_claims)
            if unknown:
                raise ContractViolation(f"research dossier cites unknown claim: {', '.join(unknown)}.")
        if dossier.mode is ResearchMode.NOT_REQUIRED and any(
            (
                dossier.sources,
                dossier.claims,
                dossier.statistics,
                dossier.quotations,
                dossier.contradictions,
                dossier.visual_opportunities,
            )
        ):
            raise ContractViolation("research dossier.not_required must not invent research output.")
        return dossier

    def to_mapping(self) -> dict[str, Any]:
        return {
            "schemaVersion": SCHEMA_VERSION,
            "mode": self.mode.value,
            "sources": [item.to_mapping() for item in self.sources],
            "claims": [item.to_mapping() for item in self.claims],
            "statistics": [item.to_mapping() for item in self.statistics],
            "quotations": [item.to_mapping() for item in self.quotations],
            "contradictions": [item.to_mapping() for item in self.contradictions],
            "visualOpportunities": [item.to_mapping() for item in self.visual_opportunities],
        }


@dataclass(frozen=True, slots=True)
class NarrativeBeat:
    id: str
    text: str
    claim_ids: tuple[str, ...]
    factual: bool

    def to_mapping(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "text": self.text,
            "claimIds": list(self.claim_ids),
            "factual": self.factual,
        }


@dataclass(frozen=True, slots=True)
class Narrative:
    angle: str
    hook: str
    beats: tuple[NarrativeBeat, ...]

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any], dossier: ResearchDossier) -> Narrative:
        value = _mapping(value, "narrative")
        _strict(value, {"schemaVersion", "angle", "hook", "beats"}, "narrative")
        if value.get("schemaVersion") != SCHEMA_VERSION:
            raise ContractViolation(f"narrative.schemaVersion must be {SCHEMA_VERSION}.")
        beats: list[NarrativeBeat] = []
        known_claims = {item.id for item in dossier.claims}
        for index, raw in enumerate(_array(value, "beats", "narrative")):
            item = _mapping(raw, f"narrative.beats[{index}]")
            _strict(item, {"id", "text", "claimIds", "factual"}, f"narrative.beats[{index}]")
            factual = item.get("factual")
            if not isinstance(factual, bool):
                raise ContractViolation(f"narrative.beats[{index}].factual must be a boolean.")
            claim_ids = _strings(item, "claimIds", f"narrative.beats[{index}]", allow_empty=not factual)
            unknown = sorted(set(claim_ids) - known_claims)
            if unknown:
                raise ContractViolation(f"narrative beat cites unknown claim: {', '.join(unknown)}.")
            beats.append(
                NarrativeBeat(
                    id=_required_string(item, "id", f"narrative.beats[{index}]"),
                    text=_required_string(item, "text", f"narrative.beats[{index}]"),
                    claim_ids=claim_ids,
                    factual=factual,
                )
            )
        if not beats:
            raise ContractViolation("narrative.beats must not be empty.")
        _unique(tuple(item.id for item in beats), "narrative beats")
        return cls(
            angle=_required_string(value, "angle", "narrative"),
            hook=_required_string(value, "hook", "narrative"),
            beats=tuple(beats),
        )

    def to_mapping(self) -> dict[str, Any]:
        return {
            "schemaVersion": SCHEMA_VERSION,
            "angle": self.angle,
            "hook": self.hook,
            "beats": [item.to_mapping() for item in self.beats],
        }


@dataclass(frozen=True, slots=True)
class VisualVocabulary:
    themes: frozenset[str]
    motion_intents: frozenset[str]
    color_roles: frozenset[str]
    treatments: frozenset[str]


@dataclass(frozen=True, slots=True)
class VisualBible:
    theme: str
    motion_intent: tuple[str, ...]
    color_roles: tuple[str, ...]
    treatments: tuple[str, ...]
    motifs: tuple[str, ...]
    forbidden_treatments: tuple[str, ...]

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any], vocabulary: VisualVocabulary) -> VisualBible:
        value = _mapping(value, "visual bible")
        _strict(
            value,
            {
                "schemaVersion",
                "theme",
                "motionIntent",
                "colorRoles",
                "treatments",
                "motifs",
                "forbiddenTreatments",
            },
            "visual bible",
        )
        if value.get("schemaVersion") != SCHEMA_VERSION:
            raise ContractViolation(f"visual bible.schemaVersion must be {SCHEMA_VERSION}.")
        theme = _required_string(value, "theme", "visual bible")
        motion = _strings(value, "motionIntent", "visual bible", allow_empty=False)
        colors = _strings(value, "colorRoles", "visual bible", allow_empty=False)
        treatments = _strings(value, "treatments", "visual bible", allow_empty=False)
        forbidden = _strings(value, "forbiddenTreatments", "visual bible")
        checks = (
            (theme in vocabulary.themes, "theme", (theme,)),
            (set(motion) <= vocabulary.motion_intents, "motionIntent", motion),
            (set(colors) <= vocabulary.color_roles, "colorRoles", colors),
            (set(treatments) <= vocabulary.treatments, "treatments", treatments),
            (set(forbidden) <= vocabulary.treatments, "forbiddenTreatments", forbidden),
        )
        for valid, name, selected in checks:
            if not valid:
                raise ContractViolation(
                    f"visual bible.{name} contains unpublished values: {', '.join(selected)}."
                )
        return cls(
            theme=theme,
            motion_intent=motion,
            color_roles=colors,
            treatments=treatments,
            motifs=_strings(value, "motifs", "visual bible"),
            forbidden_treatments=forbidden,
        )

    def to_mapping(self) -> dict[str, Any]:
        return {
            "schemaVersion": SCHEMA_VERSION,
            "theme": self.theme,
            "motionIntent": list(self.motion_intent),
            "colorRoles": list(self.color_roles),
            "treatments": list(self.treatments),
            "motifs": list(self.motifs),
            "forbiddenTreatments": list(self.forbidden_treatments),
        }


@dataclass(frozen=True, slots=True)
class ProviderAccess:
    mode: ProviderMode
    grant_id: str | None

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any], what: str) -> ProviderAccess:
        value = _mapping(value, what)
        _strict(value, {"mode", "grantId"}, what)
        mode = _enum(ProviderMode, value.get("mode"), f"{what}.mode")
        grant_id = _optional_string(value, "grantId", what)
        if mode is not ProviderMode.LIVE and grant_id is not None:
            raise ContractViolation(f"{what}.grantId is valid only for live provider mode.")
        return cls(mode=mode, grant_id=grant_id)

    def require_authorized(self, action: str) -> None:
        """Fail before a live provider is reachable; recorded work never consumes a grant."""
        if self.mode is ProviderMode.DISABLED:
            raise ContractViolation(f"{action} is disabled by operator policy.")
        if self.mode is ProviderMode.LIVE and self.grant_id is None:
            raise ContractViolation(f"{action} live provider access requires an operator grant.")

    def to_mapping(self) -> dict[str, Any]:
        return {"mode": self.mode.value, "grantId": self.grant_id}


@dataclass(frozen=True, slots=True)
class OperatorPolicy:
    research: ProviderAccess
    models: ProviderAccess
    images: ProviderAccess
    recording: ProviderAccess

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> OperatorPolicy:
        value = _mapping(value, "policy")
        _strict(value, {"schemaVersion", "research", "models", "images", "recording"}, "policy")
        if value.get("schemaVersion") != SCHEMA_VERSION:
            raise ContractViolation(f"policy.schemaVersion must be {SCHEMA_VERSION}.")
        return cls(
            research=ProviderAccess.from_mapping(value.get("research"), "policy.research"),
            models=ProviderAccess.from_mapping(value.get("models"), "policy.models"),
            images=ProviderAccess.from_mapping(value.get("images"), "policy.images"),
            recording=ProviderAccess.from_mapping(value.get("recording"), "policy.recording"),
        )

    def to_mapping(self) -> dict[str, Any]:
        return {
            "schemaVersion": SCHEMA_VERSION,
            "research": self.research.to_mapping(),
            "models": self.models.to_mapping(),
            "images": self.images.to_mapping(),
            "recording": self.recording.to_mapping(),
        }


@dataclass(frozen=True, slots=True)
class ArtifactHandle:
    """An opaque, content-bound artifact reference. It intentionally has no locator field."""

    id: str
    kind: str
    sha256: str
    media_type: str
    size_bytes: int

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> ArtifactHandle:
        value = _mapping(value, "artifact")
        _strict(value, {"id", "kind", "sha256", "mediaType", "sizeBytes"}, "artifact")
        digest = _required_string(value, "sha256", "artifact")
        if SHA256.fullmatch(digest) is None:
            raise ContractViolation("artifact.sha256 must be a lowercase SHA-256 digest.")
        kind = _required_string(value, "kind", "artifact")
        if SAFE_NAME.fullmatch(kind) is None:
            raise ContractViolation("artifact.kind must be a public contract name.")
        artifact_id = _required_string(value, "id", "artifact")
        if DISCLOSURE.search(artifact_id) or "/" in artifact_id or "\\" in artifact_id:
            raise ContractViolation("artifact.id must be opaque and must not contain a storage location.")
        media_type = _required_string(value, "mediaType", "artifact")
        if re.fullmatch(r"[a-z0-9.+-]+/[a-z0-9.+-]+", media_type) is None:
            raise ContractViolation("artifact.mediaType must be an Internet media type.")
        return cls(
            id=artifact_id,
            kind=kind,
            sha256=digest,
            media_type=media_type,
            size_bytes=_positive_integer(value.get("sizeBytes"), "artifact.sizeBytes", zero=True),
        )

    def to_mapping(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "sha256": self.sha256,
            "mediaType": self.media_type,
            "sizeBytes": self.size_bytes,
        }


@dataclass(frozen=True, slots=True)
class CrewEvent:
    brief_id: str
    sequence: int
    phase: CrewPhase
    role: CrewRole
    status: PhaseStatus
    provider_mode: ProviderMode
    summary: str
    counts: Mapping[str, int]
    artifacts: tuple[ArtifactHandle, ...]

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> CrewEvent:
        value = _mapping(value, "event")
        _strict(
            value,
            {
                "schemaVersion",
                "briefId",
                "sequence",
                "phase",
                "role",
                "status",
                "providerMode",
                "summary",
                "counts",
                "artifacts",
            },
            "event",
        )
        if value.get("schemaVersion") != SCHEMA_VERSION:
            raise ContractViolation(f"event.schemaVersion must be {SCHEMA_VERSION}.")
        phase = _enum(CrewPhase, value.get("phase"), "event.phase")
        role = _enum(CrewRole, value.get("role"), "event.role")
        if role not in PHASE_ROLES[phase]:
            raise ContractViolation(f"event.role {role.value!r} does not own phase {phase.value!r}.")
        counts_value = _mapping(value.get("counts"), "event.counts")
        counts: dict[str, int] = {}
        for name, amount in counts_value.items():
            if not isinstance(name, str) or SAFE_NAME.fullmatch(name) is None:
                raise ContractViolation("event.counts keys must be public contract names.")
            counts[name] = _positive_integer(amount, f"event.counts.{name}", zero=True)
        artifacts_value = value.get("artifacts")
        if isinstance(artifacts_value, (str, bytes)) or not isinstance(artifacts_value, Sequence):
            raise ContractViolation("event.artifacts must be an array.")
        return cls(
            brief_id=_required_string(value, "briefId", "event"),
            sequence=_positive_integer(value.get("sequence"), "event.sequence"),
            phase=phase,
            role=role,
            status=_enum(PhaseStatus, value.get("status"), "event.status"),
            provider_mode=_enum(ProviderMode, value.get("providerMode"), "event.providerMode"),
            summary=_safe_summary(value, "summary", "event"),
            counts=counts,
            artifacts=tuple(ArtifactHandle.from_mapping(item) for item in artifacts_value),
        )

    def to_mapping(self) -> dict[str, Any]:
        return {
            "schemaVersion": SCHEMA_VERSION,
            "briefId": self.brief_id,
            "sequence": self.sequence,
            "phase": self.phase.value,
            "role": self.role.value,
            "status": self.status.value,
            "providerMode": self.provider_mode.value,
            "summary": self.summary,
            "counts": dict(self.counts),
            "artifacts": [artifact.to_mapping() for artifact in self.artifacts],
        }


@dataclass(frozen=True, slots=True)
class Rendered:
    run_id: str
    summary: str
    preview: ArtifactHandle


@dataclass(frozen=True, slots=True)
class Declined:
    run_id: str
    summary: str
    unmet_need: str
    catalog_gap: str


@dataclass(frozen=True, slots=True)
class Paused:
    run_id: str | None
    summary: str
    reason: str
    resume_id: str


@dataclass(frozen=True, slots=True)
class Failed:
    run_id: str | None
    summary: str
    code: str
    retryable: bool


TerminalResult = Rendered | Declined | Paused | Failed


@dataclass(frozen=True, slots=True)
class CrewTerminal:
    brief_id: str
    sequence: int
    result: TerminalResult

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> CrewTerminal:
        value = _mapping(value, "terminal")
        common = {"schemaVersion", "briefId", "sequence", "outcome", "runId", "summary"}
        outcome = value.get("outcome")
        extras: dict[str, set[str]] = {
            "rendered": {"preview"},
            "declined": {"unmetNeed", "catalogGap"},
            "paused": {"reason", "resumeId"},
            "failed": {"code", "retryable"},
        }
        if outcome not in extras:
            raise ContractViolation("terminal.outcome must be rendered, declined, paused, or failed.")
        _strict(value, common | extras[outcome], "terminal")
        if value.get("schemaVersion") != SCHEMA_VERSION:
            raise ContractViolation(f"terminal.schemaVersion must be {SCHEMA_VERSION}.")
        run_id = _optional_string(value, "runId", "terminal")
        summary = _safe_summary(value, "summary", "terminal")
        if outcome in {"rendered", "declined"} and run_id is None:
            raise ContractViolation(f"terminal.runId is required for {outcome}.")
        if outcome == "rendered":
            if not isinstance(value.get("preview"), Mapping):
                raise ContractViolation("terminal.preview must be an artifact handle.")
            result: TerminalResult = Rendered(
                run_id=run_id or "",
                summary=summary,
                preview=ArtifactHandle.from_mapping(value.get("preview")),
            )
        elif outcome == "declined":
            result = Declined(
                run_id=run_id or "",
                summary=summary,
                unmet_need=_safe_public_text(value, "unmetNeed", "terminal"),
                catalog_gap=_safe_public_text(value, "catalogGap", "terminal"),
            )
        elif outcome == "paused":
            result = Paused(
                run_id=run_id,
                summary=summary,
                reason=_safe_public_text(value, "reason", "terminal"),
                resume_id=_safe_public_text(value, "resumeId", "terminal"),
            )
        else:
            retryable = value.get("retryable")
            if not isinstance(retryable, bool):
                raise ContractViolation("terminal.retryable must be a boolean.")
            code = _required_string(value, "code", "terminal")
            if SAFE_NAME.fullmatch(code.lower()) is None:
                raise ContractViolation("terminal.code must be a public contract name.")
            result = Failed(run_id=run_id, summary=summary, code=code, retryable=retryable)
        return cls(
            brief_id=_required_string(value, "briefId", "terminal"),
            sequence=_positive_integer(value.get("sequence"), "terminal.sequence"),
            result=result,
        )

    def to_mapping(self) -> dict[str, Any]:
        common: dict[str, Any] = {
            "schemaVersion": SCHEMA_VERSION,
            "briefId": self.brief_id,
            "sequence": self.sequence,
            "runId": self.result.run_id,
            "summary": self.result.summary,
        }
        if isinstance(self.result, Rendered):
            return {**common, "outcome": "rendered", "preview": self.result.preview.to_mapping()}
        if isinstance(self.result, Declined):
            return {
                **common,
                "outcome": "declined",
                "unmetNeed": self.result.unmet_need,
                "catalogGap": self.result.catalog_gap,
            }
        if isinstance(self.result, Paused):
            return {
                **common,
                "outcome": "paused",
                "reason": self.result.reason,
                "resumeId": self.result.resume_id,
            }
        return {
            **common,
            "outcome": "failed",
            "code": self.result.code,
            "retryable": self.result.retryable,
        }
