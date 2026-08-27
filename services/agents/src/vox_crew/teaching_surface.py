"""Reading the teaching surface — the contract the crew authors from.

The crew starts a Run knowing nothing. It does not ship with a copy of the catalog, a list of
capability names or an idea of what the compiler checks; it asks the interface, and what comes
back is what it plans against. That is what keeps its plans tracking the catalog instead of
the model's memory, and it is why the categories below are read from the index rather than
listed here: a category the contract adds is a category the crew reads, with no edit.

The projections are held here, in the crew's context, and nowhere else. They are not written
into the work root — that is what keeps "nothing but its Run directories" true, and it is the
difference between a work root that is evidence and one that is just a directory.

The five projections are large — they assemble into ~125,000 characters of instructions, and
the catalog alone is half of that. They are read once and kept, and `planner.cache_prefix`
assembles them into instructions once, so every turn of the repair loop is authored against
that one prefix rather than against a fresh assembly of it. The catalog is re-sent every turn
regardless: what happens once is the assembly, not the transmission, and `context.py` prices it
that way. Nothing is dropped to save room: the catalog is the planner's primary
authoring input, so the one item that dominates the budget is also the one that cannot be
deferred. `context.py` holds what that costs and what a Run is allowed to spend.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

from .client import ProductionClient
from .envelopes import ResultEnvelope


class DiscoveryRefused(RuntimeError):
    """Discovery did not complete, so there is nothing to author against.

    Carries the service's own words. A crew that cannot read the contract must stop rather
    than fall back on what the model remembers about a catalog.
    """


def _refusal(what: str, envelope: ResultEnvelope) -> DiscoveryRefused:
    said = envelope.error.code + ": " + envelope.error.message if envelope.error else "no error"
    return DiscoveryRefused(f"{what} came back {envelope.outcome} ({said}).")


@dataclass(frozen=True, slots=True)
class TeachingSurface:
    """Everything the interface publishes about itself, as the crew received it."""

    index: ResultEnvelope
    projections: Mapping[str, ResultEnvelope]
    summaries: Mapping[str, str]

    @property
    def categories(self) -> tuple[str, ...]:
        return tuple(self.projections)

    @property
    def envelopes(self) -> tuple[ResultEnvelope, ...]:
        """Every envelope discovery received, in the order it received them."""
        return (self.index, *self.projections.values())

    def contract(self, category: str) -> Mapping[str, Any]:
        """One projection's contract body, as published."""
        data = self.projections[category].data or {}
        return data.get("contract", {})

    def summary(self, category: str) -> str:
        """What the index said this category teaches."""
        return self.summaries[category]


def read_teaching_surface(
    client: ProductionClient,
    on_envelope: Callable[[ResultEnvelope], None] | None = None,
) -> TeachingSurface:
    """Asks for the contract index, then for every category it publishes.

    `on_envelope` sees each envelope as it arrives, including the one that refuses. Discovery
    that stops halfway should still leave the operator holding what production actually said,
    rather than an exception where six envelopes used to be.
    """
    announce = on_envelope if on_envelope is not None else lambda _: None

    index = client.contract_index()
    announce(index)
    if not index.succeeded:
        raise _refusal("The contract index", index)

    published = (index.data or {}).get("categories") or []
    summaries = {
        str(entry["id"]): str(entry.get("summary", ""))
        for entry in published
        if isinstance(entry, Mapping) and "id" in entry
    }
    if not summaries:
        raise DiscoveryRefused("The contract index published no categories.")

    projections: dict[str, ResultEnvelope] = {}
    for category in summaries:
        envelope = client.contract_show(category)
        announce(envelope)
        if not envelope.succeeded:
            raise _refusal(f"The {category} contract", envelope)
        projections[category] = envelope

    return TeachingSurface(index=index, projections=projections, summaries=summaries)
