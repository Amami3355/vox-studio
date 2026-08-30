"""Reading the teaching surface: the tracer bullet, end to end.

The crew earns the contract by asking for it. What it must not do is keep a copy anywhere but
its own context — the work root's invariant is that it grows nothing but its Run directories,
and a cached projection is the easiest way to break it without noticing.
"""

from __future__ import annotations

import json

import pytest
from conftest import recorded
from vox_crew.client import ProductionClient
from vox_crew.envelopes import parse_envelope
from vox_crew.teaching_surface import DiscoveryRefused, read_teaching_surface

CATEGORIES = ("language", "plan", "catalog", "checks", "operating", "protocol")


def projection(category: str, contract: dict | None = None) -> str:
    return (
        json.dumps(
            {
                "protocolVersion": 1,
                "command": "contract.show",
                "outcome": "succeeded",
                "run": None,
                "data": {
                    "category": category,
                    "contractVersion": 1,
                    "contract": contract if contract is not None else {"of": category},
                },
                "artifacts": [],
                "error": None,
                "next": [],
            },
            separators=(",", ":"),
        )
        + "\n"
    )


class StubClient(ProductionClient):
    """Answers the two discovery commands and refuses to be used for anything else."""

    def __init__(self, index: str, projections: dict[str, str] | None = None) -> None:
        self._index = index
        self._projections = projections or {name: projection(name) for name in CATEGORIES}
        self.asked: list[str] = []

    def contract_index(self):
        self.asked.append("index")
        return parse_envelope(self._index)

    def contract_show(self, category: str):
        self.asked.append(category)
        return parse_envelope(self._projections[category])

    def _unused(self, *args, **kwargs):
        raise AssertionError("Discovery does not touch a Run.")

    init = status = validate = preflight = record = _unused
    compile = render = decline = fetch_artifact = _unused


def test_asks_for_the_index_and_then_every_category_it_published() -> None:
    client = StubClient(recorded("contract-index.stdout"))

    surface = read_teaching_surface(client)

    # The categories come from the index, not from a list in the crew. A category added to the
    # contract is a category the crew reads, with no edit here.
    assert client.asked == ["index", *CATEGORIES]
    assert surface.categories == CATEGORIES


def test_holds_every_projection_in_context() -> None:
    surface = read_teaching_surface(StubClient(recorded("contract-index.stdout")))

    assert surface.contract("catalog") == {"of": "catalog"}
    assert surface.summary("checks") == "Compiler error and warning meanings and repairs."
    assert surface.envelopes[0].command == "contract.index"
    assert [envelope.data["category"] for envelope in surface.envelopes[1:]] == list(CATEGORIES)


def test_keeps_every_envelope_verbatim() -> None:
    index = recorded("contract-index.stdout")
    surface = read_teaching_surface(StubClient(index))

    assert surface.envelopes[0].raw == index
    assert [envelope.raw for envelope in surface.envelopes[1:]] == [
        projection(name) for name in CATEGORIES
    ]


def test_writes_no_projection_into_the_work_root(work_root) -> None:
    """The invariant, asserted where it can actually break."""
    before = sorted(entry.name for entry in work_root.iterdir())

    read_teaching_surface(StubClient(recorded("contract-index.stdout")))

    assert sorted(entry.name for entry in work_root.iterdir()) == before == [
        "request.json",
        "vox.exe",
    ]


def test_stops_when_the_index_itself_is_refused() -> None:
    client = StubClient(recorded("run-validate-failed.stdout"))

    with pytest.raises(DiscoveryRefused) as refusal:
        read_teaching_surface(client)

    # The service's own words, not a paraphrase of them.
    assert "INVALID_INPUT" in str(refusal.value)
    assert client.asked == ["index"]


def test_stops_when_a_projection_is_refused() -> None:
    refused = json.dumps(
        {
            "protocolVersion": 1,
            "command": "contract.show",
            "outcome": "failed",
            "run": None,
            "data": None,
            "artifacts": [],
            "error": {"code": "INVALID_INVOCATION", "message": "Unknown contract category.",
                      "details": None},
            "next": [],
        },
        separators=(",", ":"),
    ) + "\n"
    client = StubClient(
        recorded("contract-index.stdout"),
        {**{name: projection(name) for name in CATEGORIES}, "catalog": refused},
    )

    with pytest.raises(DiscoveryRefused) as refusal:
        read_teaching_surface(client)

    assert "catalog" in str(refusal.value)
    assert client.asked == ["index", "language", "plan", "catalog"]


def test_refuses_an_index_that_publishes_nothing() -> None:
    empty = json.dumps(
        {
            "protocolVersion": 1,
            "command": "contract.index",
            "outcome": "succeeded",
            "run": None,
            "data": {"categories": []},
            "artifacts": [],
            "error": None,
            "next": [],
        },
        separators=(",", ":"),
    ) + "\n"

    with pytest.raises(DiscoveryRefused):
        read_teaching_surface(StubClient(empty))
