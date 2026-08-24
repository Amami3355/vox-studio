"""Driving one Run from a Brief to a rendered preview.

This is the producer's sequence with the judgement taken out: initialise, validate, Preflight,
record, compile, render, then read the reports and the preview back. Today a fixture plan is
handed to it and no model is in the loop, which is what lets the whole client surface be
exercised for zero tokens. When the planner arrives it authors the plan and calls this with
it; the sequence does not change, because the sequence is the interface's, not the model's.

Two things here are load-bearing.

**A refusal stops the Run and is returned intact.** `needs_repair` and `failed` are outcomes
the interface publishes, carrying a report, a `means`, a `repair` and the `next` commands it
suggests. That is the material the repair loop is built from, so raising on it would throw
away the thing later tickets need and replace it with a stack trace. The producer stops
because it has nothing to add — it has no plan to repair with — and hands the envelope back.

**The read-back goes through the client.** The preview and the two reports come back by
handing the descriptor an envelope published to `fetch_artifact`, never by joining a Run root
to a relative path. Locally those are the same bytes; in the cloud phase the Run's disk is not
the crew's disk, and a producer that had opened the file itself would be the module that
stranded the crew at deployment.

Nothing here knows which client implementation it is holding, which is ADR-0015's whole point.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from .client import Artifact, ProductionClient
from .envelopes import MalformedEnvelope, ResultEnvelope

# What a finished Run is asked for afterwards: the narrated preview, and the two reports that
# say how it was arrived at. Everything else a Run publishes stays where it is until something
# needs it — an evidence bundle reads by descriptor too, and reads more.
READ_BACK = ("preflight_report", "compile_report", "preview")


@dataclass(frozen=True, slots=True)
class ProducedRun:
    """What one Run produced: every envelope it received, and what it published."""

    run_id: str | None
    envelopes: tuple[ResultEnvelope, ...]
    refusal: ResultEnvelope | None
    artifacts: tuple[Artifact, ...]

    @property
    def rendered(self) -> bool:
        """Whether the Run reached a preview. A refused Run is not a failed crew."""
        return self.refusal is None and self.run_id is not None

    def artifact(self, kind: str) -> Artifact | None:
        """One artifact read back, by the kind the service named it. Kinds are its vocabulary."""
        return next((item for item in self.artifacts if item.kind == kind), None)


def produce(
    client: ProductionClient,
    request: Mapping[str, Any],
    plan: Mapping[str, Any],
    *,
    on_envelope: Callable[[ResultEnvelope], None] | None = None,
    read_back: Sequence[str] = READ_BACK,
) -> ProducedRun:
    """Carries a Brief's request and a plan through the production sequence.

    `on_envelope` sees each envelope as it arrives, including the one that refuses, so a
    caller writing an audit trail records what production said rather than what came back.
    """
    announce = on_envelope if on_envelope is not None else lambda _: None
    envelopes: list[ResultEnvelope] = []

    def step(envelope: ResultEnvelope) -> bool:
        envelopes.append(envelope)
        announce(envelope)
        return envelope.succeeded

    opened = client.init(request)
    if not step(opened):
        return ProducedRun(None, tuple(envelopes), opened, ())
    if opened.run is None:
        # Not a refusal — a success with nothing in it. Every later call names the Run this
        # one was supposed to publish, so there is nothing to carry on with and nothing to
        # report to an operator except that production said something unusable.
        raise MalformedEnvelope("run init succeeded and named no Run.")
    run_id = opened.run.id

    for call in (
        lambda: client.validate(run_id, plan),
        lambda: client.preflight(run_id),
        lambda: client.record(run_id),
        lambda: client.compile(run_id),
        lambda: client.render(run_id),
    ):
        envelope = call()
        if not step(envelope):
            return ProducedRun(run_id, tuple(envelopes), envelope, ())

    return ProducedRun(
        run_id, tuple(envelopes), None, read_back_artifacts(client, run_id, envelopes, read_back)
    )


def read_back_artifacts(
    client: ProductionClient,
    run_id: str,
    envelopes: Sequence[ResultEnvelope],
    kinds: Sequence[str],
) -> tuple[Artifact, ...]:
    """Fetches the wanted kinds by the descriptors the Run's own envelopes published.

    The last envelope to publish a kind wins, because a Run that recompiled published two
    compile reports and the second is the one that describes it now. That is exactly the rule
    a repair loop needs and the reason this is public: `converge.py` ends a Run the same way,
    and a second copy of the read-back would be the copy that drifted.
    """
    latest = {
        descriptor.kind: descriptor
        for envelope in envelopes
        for descriptor in envelope.artifacts
        if descriptor.kind in kinds
    }
    return tuple(
        client.fetch_artifact(run_id, latest[kind]) for kind in kinds if kind in latest
    )
