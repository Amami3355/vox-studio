"""The production result envelope, as the crew receives it.

Everything the crew learns about production arrives in one of these: the outcome, the
artifacts a command published, the error with its `means` and `repair`, and the `next`
commands the interface suggests. The crew's own instructions never restate any of it, so this
module's job is to make the envelope readable without making it different.

Two rules follow from that.

The first is that `raw` is kept. Parsing is a convenience for the code around the model; the
bytes are what the model is shown. Re-serialising a parsed envelope would preserve its meaning
and lose its key order, its separators and its framing, and a crew that is taught from a
paraphrase is being taught from something the service never said.

The second is that this is not a second copy of the contract. The fields below are the ones
every envelope carries, and nothing here validates a `data` payload or enumerates a command:
those belong to the published contract, which the crew fetches at run time. A parser that
knew the catalog would go stale against it.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

PROTOCOL_VERSION = 1

# Every outcome that is not `succeeded` still leaves a Run the crew can act on, except
# `failed`. `needs_repair` in particular is a refusal, not a crash: exit code 0, Run intact.
# `paused` is the one an operator has to act on: production stopped before the network and is
# waiting on an authorisation. These are outcomes an *envelope* carries; how a converged Run
# ended is a different question with its own names, in `converge.py`.
SUCCEEDED = "succeeded"
NEEDS_REPAIR = "needs_repair"
PAUSED = "paused"


class MalformedEnvelope(ValueError):
    """Stdout that is not an envelope this crew can read.

    Raised rather than repaired. A half-understood envelope is worse than no envelope: the
    crew would act on a shape it invented, and the audit trail would record the invention.
    """


@dataclass(frozen=True, slots=True)
class ArtifactDescriptor:
    """A published artifact, named by the service.

    `path` is opaque to the crew: it locates the artifact within its Run and means nothing
    without one. The crew never builds one, joins one or opens one — it hands the whole
    descriptor back to the client, which is the only place that knows a Run has a directory.
    """

    kind: str
    path: str
    sha256: str


@dataclass(frozen=True, slots=True)
class RunHandle:
    """A Run named the only way the crew is allowed to name one: by its id."""

    id: str
    stage: str


@dataclass(frozen=True, slots=True)
class EnvelopeError:
    code: str
    message: str
    details: Any


@dataclass(frozen=True, slots=True)
class NextCommand:
    """A command the interface suggests, with the reason it gave for suggesting it."""

    command: str
    args: tuple[str, ...]
    reason: str


@dataclass(frozen=True, slots=True)
class ResultEnvelope:
    raw: str
    protocol_version: int
    command: str | None
    outcome: str
    run: RunHandle | None
    data: Mapping[str, Any] | None
    artifacts: tuple[ArtifactDescriptor, ...]
    error: EnvelopeError | None
    next: tuple[NextCommand, ...]

    @property
    def succeeded(self) -> bool:
        return self.outcome == SUCCEEDED

    def artifact(self, kind: str) -> ArtifactDescriptor | None:
        """The first artifact of a kind, or None. Kinds are the service's vocabulary."""
        return next((item for item in self.artifacts if item.kind == kind), None)


def _require(value: Mapping[str, Any], key: str) -> Any:
    if key not in value:
        raise MalformedEnvelope(f"The envelope is missing {key!r}.")
    return value[key]


def _descriptor(value: Any) -> ArtifactDescriptor:
    if not isinstance(value, Mapping):
        raise MalformedEnvelope("An artifact descriptor is not an object.")
    try:
        return ArtifactDescriptor(
            kind=str(value["kind"]), path=str(value["path"]), sha256=str(value["sha256"])
        )
    except KeyError as missing:
        raise MalformedEnvelope(f"An artifact descriptor is missing {missing}.") from missing


def _next_command(value: Any) -> NextCommand:
    if not isinstance(value, Mapping):
        raise MalformedEnvelope("A next-command suggestion is not an object.")
    try:
        return NextCommand(
            command=str(value["command"]),
            args=tuple(str(argument) for argument in value["args"]),
            reason=str(value["reason"]),
        )
    except KeyError as missing:
        raise MalformedEnvelope(f"A next-command suggestion is missing {missing}.") from missing


def _sequence(value: Any, what: str) -> Sequence[Any]:
    if not isinstance(value, list):
        raise MalformedEnvelope(f"{what} is not a list.")
    return value


def parse_envelope(raw: str) -> ResultEnvelope:
    """Reads one line of production stdout, keeping the line."""
    if not raw.strip():
        raise MalformedEnvelope("Production wrote nothing to stdout.")
    try:
        document = json.loads(raw)
    except json.JSONDecodeError as broken:
        raise MalformedEnvelope(f"Production stdout is not JSON: {raw.strip()[:200]}") from broken
    if not isinstance(document, Mapping):
        raise MalformedEnvelope("Production stdout is JSON, but not an object.")

    version = _require(document, "protocolVersion")
    if version != PROTOCOL_VERSION:
        raise MalformedEnvelope(
            f"This crew speaks production protocol {PROTOCOL_VERSION}, and the service spoke "
            f"{version!r}."
        )

    run = _require(document, "run")
    if run is not None:
        if not isinstance(run, Mapping):
            raise MalformedEnvelope("The envelope's run is neither null nor an object.")
        run = RunHandle(id=str(_require(run, "id")), stage=str(_require(run, "stage")))

    error = _require(document, "error")
    if error is not None:
        if not isinstance(error, Mapping):
            raise MalformedEnvelope("The envelope's error is neither null nor an object.")
        error = EnvelopeError(
            code=str(_require(error, "code")),
            message=str(_require(error, "message")),
            details=_require(error, "details"),
        )

    data = _require(document, "data")
    if data is not None and not isinstance(data, Mapping):
        raise MalformedEnvelope("The envelope's data is neither null nor an object.")

    outcome = _require(document, "outcome")
    if not isinstance(outcome, str) or not outcome:
        raise MalformedEnvelope("The envelope's outcome is not a name.")

    command = _require(document, "command")
    if command is not None and not isinstance(command, str):
        raise MalformedEnvelope("The envelope's command is neither null nor a name.")

    return ResultEnvelope(
        raw=raw,
        protocol_version=version,
        command=command,
        outcome=outcome,
        run=run,
        data=data,
        artifacts=tuple(
            _descriptor(item) for item in _sequence(_require(document, "artifacts"), "artifacts")
        ),
        error=error,
        next=tuple(
            _next_command(item) for item in _sequence(_require(document, "next"), "next")
        ),
    )
