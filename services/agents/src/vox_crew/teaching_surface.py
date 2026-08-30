"""Reading the teaching surface — the contract the crew authors from.

The crew starts a Run knowing nothing. It does not ship with a copy of the catalog, a list of
capability names or an idea of what the compiler checks; it asks the interface, and what comes
back is what it plans against. That is what keeps its plans tracking the catalog instead of
the model's memory, and it is why the categories below are read from the index rather than
listed here: a category the contract adds is a category the crew reads, with no edit. What it
then *teaches* is narrower and the contract decides that too — see `AUTHOR` below.

The projections are held here, in the crew's context, and nowhere else. They are not written
into the work root — that is what keeps "nothing but its Run directories" true, and it is the
difference between a work root that is evidence and one that is just a directory.

The projections are large — the ones addressed to an author assemble into ~95,500 characters
of instructions, and the catalog alone is nearly 60% of that. Every category is read once and
kept, including the ones no prompt carries: `refusals.py` and `converge.py` read the rules a
repair is authored against, and what the crew reads and what it teaches are two different
questions. `planner.cache_prefix` assembles the taught ones into instructions once, so every
turn of the repair loop is authored against that one prefix rather than a fresh assembly.

The catalog is re-sent every turn regardless: what happens once is the assembly, not the
transmission, and `context.py` prices it that way. Nothing an author can act on is dropped to
save room — the catalog is the planner's primary authoring input, so the one item that
dominates the budget is also the one that cannot be deferred, and what ticket 25 removed was
material ADR-0016 already forbade it to use. `context.py` holds what that costs and what a Run
is allowed to spend.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any

from .client import ProductionClient
from .envelopes import ResultEnvelope


AUTHOR = "author"
"""The audience a prompt is assembled for. The crew reads it; it does not decide it.

The contract index publishes, per category, who that category is for. Before it did, a consumer
building a prompt had to send everything — which meant an author spent a fifth of every turn
reading the command surface ADR-0016 forbids it from touching — or invent a rule of its own
about what to skip, which is a consumer holding an opinion about a contract in a place the
contract cannot see. Neither survives the next category being added.

So the audience is obeyed and never guessed. `addressed_to` matches on this string and on
nothing else: no pattern over ids, no list of the categories the crew happens to want, and no
reading of a summary. What the crew still decides is which audience *it* is, which is a fact
about the crew rather than about the contract.
"""


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
    audiences: Mapping[str, tuple[str, ...] | None] = field(default_factory=dict)

    @property
    def categories(self) -> tuple[str, ...]:
        return tuple(self.projections)

    def audience(self, category: str) -> tuple[str, ...] | None:
        """Who the index said this category is for, or `None` where it said nothing.

        `None` and `()` are different answers and are kept apart. An index that published no
        audience field is an older contract, and every category it publishes is read — the
        alternative is a crew that goes silent against a contract it can still understand. An
        index that published an empty audience has said something, and what it said is that
        this category is addressed to nobody.
        """
        return self.audiences.get(category)

    def addressed_to(self, audience: str) -> tuple[str, ...]:
        """The categories published to `audience`, in the index's order.

        A category whose audience was not published is included: see `audience`. Everything
        else is a match against what the contract said, and nothing here reads an id or a
        summary to decide.
        """
        published = tuple(
            category
            for category in self.categories
            if (named := self.audience(category)) is None or audience in named
        )
        return published

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
    entries = [entry for entry in published if isinstance(entry, Mapping) and "id" in entry]
    summaries = {str(entry["id"]): str(entry.get("summary", "")) for entry in entries}
    audiences: dict[str, tuple[str, ...] | None] = {
        str(entry["id"]): (
            None
            if entry.get("audience") is None
            else tuple(str(name) for name in entry["audience"])
        )
        for entry in entries
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

    return TeachingSurface(
        index=index, projections=projections, summaries=summaries, audiences=audiences
    )
