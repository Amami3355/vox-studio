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
from .teaching_surface import DiscoveryRefused, TeachingSurface, read_teaching_surface

__all__ = [
    "Artifact",
    "ArtifactCorrupted",
    "ArtifactDescriptor",
    "ArtifactMissing",
    "ArtifactOutsideRun",
    "DiscoveryRefused",
    "EnvelopeError",
    "LocalProductionClient",
    "MalformedEnvelope",
    "NextCommand",
    "ProductionClient",
    "ProductionClientError",
    "ProductionUnavailable",
    "ResultEnvelope",
    "RunHandle",
    "TeachingSurface",
    "UnknownRun",
    "parse_envelope",
    "read_teaching_surface",
]
