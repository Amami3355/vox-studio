"""A production client that holds its Runs in a dictionary and reaches nothing.

It exists for one reason: the contract suite next door has to be able to fail. A suite that
ran only over `LocalProductionClient` would be green on expectations that are really about
`vox.exe`, argv or a work root, and nobody would know until a second implementation arrived and
could not satisfy them. This one has no subprocess, no disk and no socket, so an expectation it
cannot meet is an expectation that was never about the interface.

It is deliberately not `test_complete_run.py`'s `InMemoryClient`, which replays one recorded
Run in a fixed order to drive the producer. This one is a store: it opens Runs, remembers what
was staged against them, and hands artifacts back by descriptor. Merging the two would give the
producer's fixture a mutable state it does not want and give this one a script it cannot use.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from hashlib import sha256
from typing import Any
from uuid import uuid4

from vox_crew.client import (
    Artifact,
    ArtifactCorrupted,
    ArtifactMissing,
    ArtifactOutsideRun,
    ProductionClient,
    UnknownRun,
)
from vox_crew.envelopes import ArtifactDescriptor, ResultEnvelope, parse_envelope


def _envelope(
    command: str,
    *,
    run_id: str | None = None,
    stage: str = "initialized",
    artifacts: tuple[ArtifactDescriptor, ...] = (),
) -> ResultEnvelope:
    """An envelope built the way the service builds one, then parsed the way the crew reads it.

    Round-tripping through JSON rather than constructing a `ResultEnvelope` directly is what
    keeps `raw` honest: the crew is taught from those bytes, and a fake that filled the field
    with something it never serialised would be teaching from a paraphrase.
    """
    return parse_envelope(
        json.dumps(
            {
                "protocolVersion": 1,
                "command": command,
                "outcome": "succeeded",
                "run": None if run_id is None else {"id": run_id, "stage": stage},
                "data": None,
                "artifacts": [
                    {"kind": each.kind, "path": each.path, "sha256": each.sha256}
                    for each in artifacts
                ],
                "error": None,
                "next": [],
            }
        )
        + "\n"
    )


class InMemoryProductionClient(ProductionClient):
    def __init__(self) -> None:
        self._runs: dict[str, dict[str, bytes]] = {}
        self._staged: dict[str, dict[str, Any]] = {}

    # -- what the harness needs, and the interface does not publish -------------------------

    def publish(self, run_id: str, path: str, body: bytes) -> None:
        """Puts bytes into a Run, standing in for a command that produced them."""
        self._require(run_id)[path] = body

    def staged(self, run_id: str, name: str) -> Any:
        return self._staged.get(run_id, {}).get(name)

    # -- the command surface ---------------------------------------------------------------

    def contract_index(self) -> ResultEnvelope:
        return _envelope("contract.index")

    def contract_show(self, category: str) -> ResultEnvelope:
        return _envelope("contract.show")

    def init(self, request: Mapping[str, Any]) -> ResultEnvelope:
        run_id = str(uuid4())
        self._runs[run_id] = {}
        self._staged[run_id] = {"request.json": dict(request)}
        return _envelope("run.init", run_id=run_id)

    def status(self, run_id: str) -> ResultEnvelope:
        self._require(run_id)
        return _envelope("run.status", run_id=run_id)

    def validate(self, run_id: str, plan: Mapping[str, Any]) -> ResultEnvelope:
        self._stage(run_id, "plan.json", plan)
        return _envelope("run.validate", run_id=run_id, stage="validated")

    def preflight(self, run_id: str) -> ResultEnvelope:
        self._require(run_id)
        return _envelope("run.preflight", run_id=run_id, stage="validated")

    def record(
        self, run_id: str, replacement_authorisation: Mapping[str, Any] | None = None
    ) -> ResultEnvelope:
        if replacement_authorisation is not None:
            self._stage(run_id, "replacement-authorisation.json", replacement_authorisation)
        else:
            self._require(run_id)
        return _envelope("run.record", run_id=run_id, stage="recorded")

    def compile(self, run_id: str) -> ResultEnvelope:
        self._require(run_id)
        return _envelope("run.compile", run_id=run_id, stage="compiled")

    def render(self, run_id: str) -> ResultEnvelope:
        self._require(run_id)
        return _envelope("run.render", run_id=run_id, stage="rendered")

    def image_start(
        self,
        run_id: str,
        request: Mapping[str, Any],
        authorisation: Mapping[str, Any] | None = None,
    ) -> ResultEnvelope:
        self._stage(run_id, "image-request.json", request)
        if authorisation is not None:
            self._stage(run_id, "image-authorisation.json", authorisation)
        return _envelope("run.image.start", run_id=run_id, stage="compiled")

    def image_status(self, run_id: str, job_id: str) -> ResultEnvelope:
        self._require(run_id)
        return _envelope("run.image.status", run_id=run_id, stage="compiled")

    def image_accept(self, run_id: str, decision: Mapping[str, Any]) -> ResultEnvelope:
        self._stage(run_id, "image-acceptance.json", decision)
        return _envelope("run.image.accept", run_id=run_id, stage="compiled")

    def image_reject(self, run_id: str, decision: Mapping[str, Any]) -> ResultEnvelope:
        self._stage(run_id, "image-rejection.json", decision)
        return _envelope("run.image.reject", run_id=run_id, stage="compiled")

    def decline(self, run_id: str, decision: Mapping[str, Any]) -> ResultEnvelope:
        self._stage(run_id, "decision.json", decision)
        return _envelope("run.decline", run_id=run_id, stage="declined")

    def fetch_artifact(self, run_id: str, artifact: ArtifactDescriptor) -> Artifact:
        run = self._require(run_id)
        # A store with no directories still has to refuse an escaping locator, because the
        # refusal is a property of the interface rather than of a filesystem.
        if artifact.path.startswith("../") or "/../" in artifact.path:
            raise ArtifactOutsideRun(f"{artifact.path!r} is not inside the Run that published it.")
        data = run.get(artifact.path)
        if data is None:
            raise ArtifactMissing(f"Run {run_id} published {artifact.kind!r} and it is not there.")
        actual = sha256(data).hexdigest()
        if actual != artifact.sha256:
            raise ArtifactCorrupted(
                f"Run {run_id} published {artifact.kind!r} as {artifact.sha256} and it hashes "
                f"to {actual}."
            )
        return Artifact(kind=artifact.kind, sha256=actual, data=data)

    # -- internals -------------------------------------------------------------------------

    def _require(self, run_id: str) -> dict[str, bytes]:
        run = self._runs.get(run_id)
        if run is None:
            raise UnknownRun(f"No Run named {run_id!r} in this store.")
        return run

    def _stage(self, run_id: str, name: str, payload: Mapping[str, Any]) -> None:
        self._require(run_id)
        self._staged.setdefault(run_id, {})[name] = dict(payload)
