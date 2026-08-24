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
    review,
    scan_for_leaks,
)
from .producer import READ_BACK, ProducedRun, produce
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
    "DiscoveryRefused",
    "EnvelopeError",
    "Finding",
    "InstructionsLeaked",
    "LeakScan",
    "LocalProductionClient",
    "MalformedEnvelope",
    "NextCommand",
    "PlanAuthor",
    "PlanNotAuthored",
    "ProducedRun",
    "ProductionClient",
    "ProductionClientError",
    "ProductionUnavailable",
    "READ_BACK",
    "ResultEnvelope",
    "RunHandle",
    "TeachingSurface",
    "UnknownRun",
    "author_plan",
    "instructions",
    "parse_envelope",
    "plan_and_produce",
    "produce",
    "read_teaching_surface",
    "review",
    "scan_for_leaks",
]
