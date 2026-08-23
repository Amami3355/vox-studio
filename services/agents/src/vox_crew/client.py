"""The production client: the crew's only way to reach production, and the deployment seam.

ADR-0015 puts the local-to-cloud seam here rather than at the transport. There is one
interface with two implementations — a local one that spawns the launcher, and an HTTP one
when the service moves to Cloud Run — and no tool, agent instruction or test may branch on
which is active. That only holds if the interface itself has nothing local about it, which is
why every method below is payload-shaped in both directions:

- a Run is named by its id, never by where it happens to live;
- inputs the command surface takes as files (`--request`, `--plan`, `--decision`,
  `--replacement-authorisation`) arrive here as objects, and the implementation stages them;
- artifacts come back through `fetch_artifact`, which takes a Run id and the descriptor an
  envelope published, rather than by joining a Run root to a relative path.

The read-back direction is the one that matters most. The crew reads its compile and Preflight
reports off its own disk today, and in the cloud that disk is not there. A method here that
took or returned a path would work locally and strand the crew at deployment, so it is a
defect against this module even when it works. `tests/test_local_client.py` asserts it
structurally rather than trusting review to catch it.

The methods mirror the published command surface one for one, and keep its names, so the
vocabulary the model is shown has a single source: the contract, not this file.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from .envelopes import ArtifactDescriptor, ResultEnvelope


class ProductionClientError(RuntimeError):
    """Something went wrong reaching production, as opposed to production refusing."""


class ProductionUnavailable(ProductionClientError):
    """The launcher could not be run at all. Not a refusal: no Run was touched."""


class UnknownRun(ProductionClientError):
    """A Run id this client cannot place. The crew named a Run that does not exist here."""


class ArtifactMissing(ProductionClientError):
    """An envelope published a descriptor and the artifact is not there."""


class ArtifactCorrupted(ProductionClientError):
    """The artifact's bytes do not hash to what the envelope said they would."""


class ArtifactOutsideRun(ProductionClientError, ValueError):
    """A descriptor that points out of the Run that published it.

    Descriptors come from envelopes the service wrote, so this should never happen. It is a
    distinct error rather than a swallowed one because the boundary is the product: a client
    that quietly read the file anyway would be the whole failure, not a symptom of it.
    """


@dataclass(frozen=True, slots=True)
class Artifact:
    """An artifact's bytes, already checked against the descriptor that named them."""

    kind: str
    sha256: str
    data: bytes

    def text(self, encoding: str = "utf-8") -> str:
        return self.data.decode(encoding)

    def json(self) -> Any:
        return json.loads(self.text())


class ProductionClient(ABC):
    """The Agent production interface, as the crew sees it."""

    @abstractmethod
    def contract_index(self) -> ResultEnvelope:
        """The published contract categories and what each one teaches."""

    @abstractmethod
    def contract_show(self, category: str) -> ResultEnvelope:
        """One contract projection, named by a category the index published."""

    @abstractmethod
    def init(self, request: Mapping[str, Any]) -> ResultEnvelope:
        """Opens a Run for a Brief. The envelope names the Run every later call refers to."""

    @abstractmethod
    def status(self, run_id: str) -> ResultEnvelope:
        """Where a Run stands, and which of its bindings have gone stale."""

    @abstractmethod
    def validate(self, run_id: str, plan: Mapping[str, Any]) -> ResultEnvelope:
        """Submits a VideoPlan. A rejected plan comes back as a refusal with a report."""

    @abstractmethod
    def preflight(self, run_id: str) -> ResultEnvelope:
        """Advisory duration and shape findings, before anything is spent."""

    @abstractmethod
    def record(
        self, run_id: str, replacement_authorisation: Mapping[str, Any] | None = None
    ) -> ResultEnvelope:
        """Records a Take. The authorisation is only ever supplied by an operator decision."""

    @abstractmethod
    def compile(self, run_id: str) -> ResultEnvelope:
        """Folds the plan and the Take into a timed document."""

    @abstractmethod
    def render(self, run_id: str) -> ResultEnvelope:
        """Renders the narrated preview."""

    @abstractmethod
    def decline(self, run_id: str, decision: Mapping[str, Any]) -> ResultEnvelope:
        """Ends a Run by naming the editorial need the catalog cannot serve."""

    @abstractmethod
    def fetch_artifact(self, run_id: str, artifact: ArtifactDescriptor) -> Artifact:
        """Reads back an artifact an envelope published, by the descriptor it published."""
