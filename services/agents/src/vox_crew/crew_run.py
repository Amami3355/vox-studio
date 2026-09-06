"""Assembling the production crew an invocation asks for, from what production published.

`ProductionCrew` takes adapters and a vocabulary and knows nothing about where they came from.
This is where they come from: the operator's policy chooses live or recorded providers per phase,
the catalog and design projections supply the vocabulary and the palettes, and the existing
production client supplies the Run. Nothing here decides an editorial question, and nothing the
crew receives from here carries a path, a launcher, a credential or a Production command.

The split matters for the same reason `author_for` is its own seam: on a machine holding no model
credential, building the crew is the furthest the live path can be followed, and a test that could
only reach it through a whole Run could not follow it at all.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

from .client import ProductionClient
from .crew import ProductionCrew
from .crew_contract import (
    Brief,
    BriefKind,
    ContractViolation,
    OperatorPolicy,
    ProviderMode,
)
from .crew_state import CrewStateStore, FileCrewStateStore
from .image_generation import ImageCandidate
from .recorded import (
    ClientProductionAdapter,
    RecordedCreativeAdapter,
    RecordedResearchAdapter,
)
from .teaching_surface import TeachingSurface
from .visual_planner import PublishedCatalog, SplitVisualPlanner, trusted_palettes, visual_vocabulary

CHECKPOINTS = "crew-state"
"""Where a resumable crew keeps its checkpoints, relative to the evidence directory."""

RESEARCH_KEYS = ("researchDossier",)
"""What a recorded research phase replays."""

MODEL_KEYS = ("narrative", "visualBible", "videoPlan")
"""What a recorded model phase replays: the two creative roles and the plan they lead to."""


class CrewNotConfigured(RuntimeError):
    """The invocation asks for a crew this work root cannot supply.

    Raised before a Run is opened and before any provider is reached, because every case it
    covers — a missing recording, an unpublished vocabulary, a policy that does not parse — is a
    fact about the invocation rather than about the Brief.
    """


def recorded_policy() -> OperatorPolicy:
    """Every phase recorded and nothing authorised: the default a bare invocation gets.

    A default that reached a live provider would make spending the accident and saving the
    deliberate act, which is the wrong way round for every provider the crew holds.
    """
    recorded = {"mode": ProviderMode.RECORDED.value, "grantId": None}
    return OperatorPolicy.from_mapping(
        {
            "schemaVersion": 1,
            "research": dict(recorded),
            "models": dict(recorded),
            "images": dict(recorded),
            "recording": dict(recorded),
        }
    )


def read_policy(path: Path) -> OperatorPolicy:
    """The operator's policy as the contract shapes it, refused rather than repaired."""
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as unreadable:
        raise CrewNotConfigured(f"the policy at {path} could not be read: {unreadable}") from None
    try:
        return OperatorPolicy.from_mapping(value)
    except ContractViolation as refused:
        raise CrewNotConfigured(f"the policy at {path} is not one: {refused}") from None


def read_recordings(path: Path) -> Mapping[str, Any]:
    """The documents a recorded crew replays instead of asking a provider for them.

    Which of them are *needed* depends on the policy and is checked where that is known, so an
    invocation whose research is live is not asked for a dossier it will never read.
    """
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as unreadable:
        raise CrewNotConfigured(
            f"the recordings at {path} could not be read: {unreadable}"
        ) from None
    if not isinstance(value, Mapping):
        raise CrewNotConfigured(f"the recordings at {path} must be an object.")
    return value


def brief_from(request: Mapping[str, Any], kind: BriefKind) -> Brief:
    """The Brief the work root already carries, with the kind the invocation declared.

    The kind is the invocation's to state and not the request's: it decides whether a provider is
    reached at all, and a work root that could assert its own Brief was factual would be a work
    root that could spend a research call by being copied.
    """
    brief = request.get("brief")
    if not isinstance(brief, Mapping):
        raise CrewNotConfigured("the request carries no Brief for the crew to begin from.")
    try:
        return Brief.from_mapping(
            {"id": brief.get("id"), "text": brief.get("text"), "kind": kind.value}
        )
    except ContractViolation as refused:
        raise CrewNotConfigured(f"the request's Brief is not one: {refused}") from None


def build_crew(
    client: ProductionClient,
    surface: TeachingSurface,
    request: Mapping[str, Any],
    policy: OperatorPolicy,
    *,
    brief_kind: BriefKind = BriefKind.FACTUAL,
    recordings: Mapping[str, Any] | None = None,
    state_store: CrewStateStore | None = None,
    image_decider: Callable[[ImageCandidate], bool] | None = None,
    model: str | None = None,
) -> ProductionCrew:
    """The crew this policy asks for, over the catalog and palettes production published.

    Live and recorded adapters satisfy the same protocols, so this chooses between them once and
    the Director never learns which it holds. Phases are chosen independently — live research
    against a recorded plan is a useful rehearsal — and every event the crew emits carries the
    mode it ran in, so a bundle can never claim a live path it replayed from a file.
    """
    try:
        catalog_contract = surface.contract("catalog")
        design_contract = surface.contract("design")
    except KeyError as unpublished:
        raise CrewNotConfigured(
            f"production published no {unpublished} projection; this crew needs it."
        ) from None

    try:
        vocabulary = visual_vocabulary(catalog_contract)
        palettes = trusted_palettes(design_contract)
        catalog = PublishedCatalog.from_mapping(catalog_contract)
    except ContractViolation as refused:
        raise CrewNotConfigured(f"the published contract cannot direct a crew: {refused}") from None

    live_models = policy.models.mode is ProviderMode.LIVE
    live_research = policy.research.mode is ProviderMode.LIVE

    # Only the phases the policy left recorded need a recording, and each is named where it is
    # missing: an operator running live research against a recorded plan should not be asked for
    # a dossier the Run will never read. A Brief that is not factual is not researched at all,
    # so it needs no dossier from either side.
    researched = brief_kind is BriefKind.FACTUAL
    needed = ([] if live_research or not researched else list(RESEARCH_KEYS)) + (
        [] if live_models else list(MODEL_KEYS)
    )
    missing = [
        key
        for key in needed
        if recordings is None or not isinstance(recordings.get(key), Mapping)
    ]
    if missing:
        raise CrewNotConfigured(
            f"a recorded phase needs recordings to replay; no {', '.join(missing)} was supplied."
        )

    if not researched:
        # The zero-call path, made unmissable rather than merely unused: a Brief declared
        # fictional or as test data reaches an adapter that cannot answer, so a crew that asked
        # it anything would fail loudly instead of quietly spending a research call.
        research: Any = _NoResearch(policy.research.mode)
    elif live_research:
        from .parallel_research import ParallelResearchAdapter  # noqa: PLC0415

        research = ParallelResearchAdapter()
    else:
        assert recordings is not None
        research = RecordedResearchAdapter(recordings["researchDossier"])

    if live_models:
        from .adk_roles import (  # noqa: PLC0415
            AdkCreativeAdapter,
            AdkSceneAuthor,
            AdkVisualStructurer,
        )

        creative: Any = (
            AdkCreativeAdapter() if model is None else AdkCreativeAdapter(model=model)
        )
        structurer = AdkVisualStructurer() if model is None else AdkVisualStructurer(model=model)
        scene_author = AdkSceneAuthor() if model is None else AdkSceneAuthor(model=model)
        planner: Any = SplitVisualPlanner(
            catalog,
            structurer,
            scene_author,
            validate_scene=_scene_validator(),
            validate_plan=_plan_validator(),
            mode=ProviderMode.LIVE,
        )
    else:
        assert recordings is not None
        creative = RecordedCreativeAdapter(
            recordings["narrative"], recordings["visualBible"], recordings["videoPlan"]
        )
        planner = creative

    return ProductionCrew(
        research,
        creative,
        ClientProductionAdapter(
            client,
            request,
            recording_mode=policy.recording.mode,
            palettes=palettes,
            image_decider=image_decider,
        ),
        visual_vocabulary=vocabulary,
        visual_planner=planner,
        state_store=state_store,
    )


def checkpoint_store(evidence: Path) -> FileCrewStateStore:
    """Where a crew that can be resumed keeps what it already paid for."""
    return FileCrewStateStore(evidence / CHECKPOINTS)


class _NoResearch:
    """The research adapter a Brief that declares itself unresearchable gets."""

    def __init__(self, mode: ProviderMode) -> None:
        self.mode = mode
        self.calls = 0

    async def research(self, brief: Brief) -> Mapping[str, Any]:
        self.calls += 1
        raise ContractViolation(
            "A Brief that is not factual is not researched; no provider should have been asked."
        )


def _deferred_validation(what: str) -> Mapping[str, Any]:
    """A pre-check that reports what it did not do, rather than a green it did not earn.

    **Production is the only validator, and it validates inside a Run.** `run.validate` takes a
    Run, and the Director opens one only after the plan is authored — so at the moment the Visual
    Planner would like an answer, there is nobody who can give it one. What the planner does hold
    is the structure it enforces itself: Beats preserved verbatim, only selected capabilities,
    scenes filled exactly where slots were opened. Those raise where they fail, before this.

    So this reports `ok` and names the authority it deferred to, and a plan the compiler refuses
    comes back as a refusal terminal from the phase that could actually ask. The alternative — a
    pre-check that guessed — would be a second compiler, which is the thing the six rules exist to
    prevent.
    """
    return {
        "ok": True,
        "findings": [],
        "deferredTo": "run.validate",
        "subject": what,
    }


def _scene_validator() -> Callable[[Mapping[str, Any]], Mapping[str, Any]]:
    """One SceneInstance, deferred to the Run the Director opens after planning."""

    def validate(scene: Mapping[str, Any]) -> Mapping[str, Any]:
        return _deferred_validation("sceneInstance")

    return validate


def _plan_validator() -> Callable[[Mapping[str, Any]], Mapping[str, Any]]:
    """The whole VideoPlan, deferred the same way and refused by Production if it is wrong."""

    def validate(plan: Mapping[str, Any]) -> Mapping[str, Any]:
        return _deferred_validation("videoPlan")

    return validate


__all__ = [
    "CHECKPOINTS",
    "CrewNotConfigured",
    "build_crew",
    "brief_from",
    "checkpoint_store",
    "read_policy",
    "read_recordings",
    "recorded_policy",
]
