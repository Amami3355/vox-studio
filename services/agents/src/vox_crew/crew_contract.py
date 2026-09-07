"""The one public contract of the production crew.

The contract is deliberately independent of ADK, providers, Production transports and files.
A Web caller and a recorded test consume the same values: ordered phase events followed by one
explicit terminal result.  Constructors parse untrusted adapter/model output strictly; dataclass
instances therefore represent values that have already crossed their owning schema gate.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping, Sequence
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


class UnservableBrief(Exception):
    """The catalog cannot truthfully express an editorial need.

    Not a ContractViolation. A role that says "nothing published serves this" has obeyed its
    contract, and the Run's honest end is a Decline rather than a failure — CONTEXT.md is
    explicit that refusing an unservable Brief is correct production behaviour. It lives here
    rather than beside the state machine because the roles that raise it may not import the
    orchestrator that catches it.
    """

    def __init__(self, summary: str, unmet_need: str, catalog_gap: str) -> None:
        super().__init__(summary)
        self.summary = summary
        self.unmet_need = unmet_need
        self.catalog_gap = catalog_gap


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
    PLAN_REPAIR_AGENT = "plan_repair_agent"
    ASSET_RESOLVER = "asset_resolver"
    IMAGE_CREATOR_AGENT = "image_creator_agent"


def read_image_decisions(
    value: Any, malformed: Callable[[str], Exception], what: str
) -> tuple[tuple[str, Mapping[str, Any]], ...]:
    """Every saved Image Creator decision in `value`, in requirement-id order.

    One reader because the checkpoint, the crew's counts and the evidence bundle each read the
    same `imageDecisions` map and each has to agree about what a well-formed entry is. Three
    hand-written copies of the shape drift apart on the first field added to a decision, and the
    one that drifts is the one that stops noticing a malformed entry.

    The caller supplies its own exception: this is an envelope fault in the checkpoint, a
    contract fault when Production returns it, and an evidence fault in a bundle.
    """
    if not isinstance(value, Mapping):
        raise malformed(what)
    decisions: list[tuple[str, Mapping[str, Any]]] = []
    for requirement_id, decision in value.items():
        if (
            not isinstance(requirement_id, str)
            or not isinstance(decision, Mapping)
            or decision.get("role") != CrewRole.IMAGE_CREATOR_AGENT.value
            or not isinstance(decision.get("needsImage"), bool)
        ):
            raise malformed(what)
        decisions.append((requirement_id, decision))
    return tuple(sorted(decisions, key=lambda item: item[0]))


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


@dataclass(frozen=True, slots=True)
class ResearchTrace:
    """The safe, provider-neutral question plan used for one research call."""

    inquiry: tuple[str, ...] = ()
    planned: bool = False

    def __post_init__(self) -> None:
        if not isinstance(self.planned, bool):
            raise ContractViolation("A research trace must say whether planning was attempted.")
        if not isinstance(self.inquiry, tuple):
            raise ContractViolation("A research inquiry must be an immutable question sequence.")
        if len(self.inquiry) != len(set(self.inquiry)):
            raise ContractViolation("A research inquiry must not repeat questions.")
        for question in self.inquiry:
            if not isinstance(question, str) or not question.strip():
                raise ContractViolation("A research inquiry must contain non-empty questions.")
            if DISCLOSURE.search(question):
                raise ContractViolation(
                    "A research inquiry must not contain credentials, paths, or implementation details."
                )


PHASE_ROLES: dict[CrewPhase, frozenset[CrewRole]] = {
    CrewPhase.RESEARCH: frozenset({CrewRole.RESEARCH_AGENT, CrewRole.DIRECTOR}),
    CrewPhase.NARRATIVE: frozenset({CrewRole.NARRATIVE_AGENT}),
    CrewPhase.ART_DIRECTION: frozenset({CrewRole.ART_DIRECTOR_AGENT}),
    # Repair reports inside visual planning rather than in a phase of its own: it is conditional,
    # it produces no separate artifact, and a phase that most Runs never enter would make the
    # ordinary event sequence the exception.
    CrewPhase.VISUAL_PLANNING: frozenset(
        {CrewRole.VISUAL_PLANNER, CrewRole.PLAN_REPAIR_AGENT, CrewRole.DIRECTOR}
    ),
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

    def to_mapping(self) -> dict[str, list[str]]:
        """The closed vocabulary as an Art Director is shown it.

        Sorted, and not incidentally. These are sets, and a set's iteration order is not stable
        across processes — serialising one unsorted would put a different prompt in front of the
        same role on every run, which is exactly the prefix identity ADR-0019 requires to hold
        inside a role. Sorting is what makes the payload a function of the catalog alone.
        """
        return {
            "themes": sorted(self.themes),
            "motionIntents": sorted(self.motion_intents),
            "colorRoles": sorted(self.color_roles),
            "treatments": sorted(self.treatments),
        }


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


# Whether invoking the same Brief again may plausibly reach a different outcome.
#
# **This is advice to an operator, never permission for the crew to loop.** The Director keeps
# control of spend and no paid call is replayed automatically; what this answers is the question
# an operator asks on reading a failure, which is whether running it again is worth anything.
#
# The line it draws is between a failure whose cause is nondeterministic — a provider that
# answered malformed, a transport that dropped mid-command — and one whose cause is a fact about
# the invocation that will still be true on the next attempt. A configuration naming the wrong
# Brief does not improve by being run twice; a model returning unparseable JSON very well may.
#
# Retrying is cheap precisely because the crew checkpoints every completed phase: a retried Run
# resumes and repays only the phase that failed, not the research and creative work before it.
#
# Codes Production authored are deliberately absent. `recorded.py` passes a refusal's own error
# code through to the terminal, and a code the crew did not write is not the crew's to classify —
# those report `False`, which here means "not claimed" rather than "known to be permanent".
RETRYABLE_FAILURES: Mapping[str, bool] = {
    # Nondeterministic: a provider or model answered, and answered badly.
    "RESEARCH_CONTRACT_INVALID": True,
    "RESEARCH_FAILED": True,
    "NARRATIVE_CONTRACT_INVALID": True,
    "CREATIVE_PHASE_FAILED": True,
    "VISUAL_BIBLE_CONTRACT_INVALID": True,
    "VIDEO_PLAN_CONTRACT_INVALID": True,
    "VISUAL_PLANNING_FAILED": True,
    # The transport, not the Run. A tunnel that died under a synchronous render surfaces here,
    # and the Run it was carrying is still on the other side to be resumed.
    "PRODUCTION_FAILED": True,
    # Facts about the invocation. Something has to change before another attempt means anything.
    "PRODUCTION_CONTRACT_INVALID": False,
    "PROVIDER_MODE_MISMATCH": False,
    "DECLINE_UNAVAILABLE": False,
    "PRODUCTION_BRIEF_MISMATCH": False,
    "IMAGE_PALETTE_MISSING": False,
    "PREVIEW_MISSING": False,
}


class UnclassifiedFailure(ContractViolation):
    """A crew failure code that the retry table does not classify.

    Raised rather than defaulted. A new code reaching an operator with a silent `retryable=False`
    is the defect this table exists to prevent, and the cheapest moment to notice it is the one
    where the code is introduced.
    """


def crew_failure(code: str, summary: str, *, run_id: str | None = None) -> Failed:
    """Build a `Failed` whose `retryable` is read from the table rather than asserted at the site.

    Every call site used to write `retryable=False` by hand, so the field carried no information
    and was wrong wherever the cause was a model or a socket. Reading it from one table means a
    code is classified once, next to the codes it has to be consistent with.
    """
    if code not in RETRYABLE_FAILURES:
        raise UnclassifiedFailure(f'Failure code "{code}" is not classified as retryable or not.')
    return Failed(run_id=run_id, summary=summary, code=code, retryable=RETRYABLE_FAILURES[code])


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
