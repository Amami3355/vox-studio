"""The Vox Studio agent crew.

The crew takes an editorial Brief and drives the Agent production interface to a narrated
preview: discover the contracts, author a VideoPlan, repair it against the compiler's
refusals, Preflight, record a Take, compile, render — or Decline, when the catalog cannot
serve what the Brief asks for.

It works from inside an isolated work root that begins as the launcher and the Brief's request
and nothing else, and it never sees repository source. Everything it knows about production it
asked for.
"""

from .client import (
    Artifact,
    ArtifactCorrupted,
    ArtifactMissing,
    ArtifactOutsideRun,
    ProductionClient,
    ProductionClientError,
    ProductionUnavailable,
    UnknownRun,
)
from .converge import (
    BUDGET_EXHAUSTED,
    DISPATCHED,
    MARGIN_CLEAR,
    PAUSED,
    RENDERED,
    REUSED,
    STOPPED,
    ConvergedRun,
    RepairBudget,
    Take,
    beat_shape,
    converge,
    preflight_risks,
    repair_budget,
    take_bound,
    take_preserved,
    target_seconds,
)
from .envelopes import (
    ArtifactDescriptor,
    EnvelopeError,
    MalformedEnvelope,
    NextCommand,
    ResultEnvelope,
    RunHandle,
    parse_envelope,
)
from .local_client import LocalProductionClient
from .planner import (
    AdkPlanAuthor,
    AuthoredPlan,
    AuthoredRun,
    Finding,
    InstructionsLeaked,
    LeakScan,
    PlanAuthor,
    PlanNotAuthored,
    author_plan,
    instructions,
    plan_and_produce,
    repair_plan,
    review,
    scan_for_leaks,
)
from .producer import READ_BACK, ProducedRun, produce, read_back_artifacts
from .refusals import Refusal, read_refusal
from .teaching_surface import DiscoveryRefused, TeachingSurface, read_teaching_surface

__all__ = [
    "AdkPlanAuthor",
    "Artifact",
    "ArtifactCorrupted",
    "ArtifactDescriptor",
    "ArtifactMissing",
    "ArtifactOutsideRun",
    "AuthoredPlan",
    "AuthoredRun",
    "BUDGET_EXHAUSTED",
    "ConvergedRun",
    "DISPATCHED",
    "DiscoveryRefused",
    "EnvelopeError",
    "Finding",
    "InstructionsLeaked",
    "LeakScan",
    "LocalProductionClient",
    "MARGIN_CLEAR",
    "MalformedEnvelope",
    "NextCommand",
    "PAUSED",
    "PlanAuthor",
    "PlanNotAuthored",
    "ProducedRun",
    "ProductionClient",
    "ProductionClientError",
    "ProductionUnavailable",
    "READ_BACK",
    "RENDERED",
    "REUSED",
    "Refusal",
    "RepairBudget",
    "ResultEnvelope",
    "RunHandle",
    "STOPPED",
    "Take",
    "TeachingSurface",
    "UnknownRun",
    "author_plan",
    "beat_shape",
    "converge",
    "instructions",
    "parse_envelope",
    "plan_and_produce",
    "preflight_risks",
    "produce",
    "read_back_artifacts",
    "read_refusal",
    "read_teaching_surface",
    "repair_budget",
    "repair_plan",
    "review",
    "scan_for_leaks",
    "take_bound",
    "take_preserved",
    "target_seconds",
]
