"""The census of the assembled instructions, over the recorded contract fixtures.

The census is a measuring instrument, so what is asserted here is whether it can be trusted
rather than what today's numbers happen to be. Nothing below pins a count: the prefix is
assembled from projections another team publishes, and a suite that went red because a
capability was added would be this crew holding the contract hostage to a ratio nobody has
argued for.

What is asserted is that the instrument reads everything it was given, reads it through the
vocabulary the contract publishes, and says so when it cannot.
"""

from __future__ import annotations

import json
import pathlib

import pytest
from conftest import recorded
from test_planner import SURFACE
from test_teaching_surface import projection
from vox_crew.census import CensusIncomplete, take_census
from vox_crew.census_record import render_prefix_census
from vox_crew.envelopes import parse_envelope
from vox_crew.planner import CachedPrefix, cache_prefix
from vox_crew.teaching_surface import TeachingSurface


def test_the_division_accounts_for_every_character_of_the_prefix() -> None:
    """The one thing the census asserts about itself: it read the whole thing.

    A census that silently skipped a category would report a balance over material it had not
    seen, which is worse than not measuring.
    """
    prefix = cache_prefix(SURFACE)

    census = take_census(prefix)

    assert [part.name for part in census.parts] == ["preamble", *SURFACE.categories]
    assert sum(part.chars for part in census.parts) == census.chars == prefix.chars


def test_a_prefix_the_census_cannot_divide_is_refused() -> None:
    """The accounting is asserted rather than assumed, so it has to be able to fail."""
    with pytest.raises(CensusIncomplete) as refused:
        take_census(CachedPrefix(surface=SURFACE, text="Not the instructions at all."))

    assert "language" in str(refused.value)


TIME = SURFACE.contract("catalog")["time"]
"""The published anchor vocabulary, reused by the made-up prefixes below.

A fixture that invented its own forms would be testing a reader nothing uses. What the
fixtures make up is the material the anchors sit in, never the grammar they are read by.
"""


def a_prefix_carrying(*events: tuple[str, str], time: dict | None = None) -> CachedPrefix:
    """A prefix over a made-up catalog whose one capability publishes exactly these events.

    Built as a surface rather than as a string so that the census divides it the same way it
    divides a real one — an instrument tested against text it never has to account for would
    be tested at the wrong seam.
    """
    catalog = {
        "manifestVersion": 4,
        "time": TIME if time is None else time,
        "capabilities": [
            {
                "id": "demonstration",
                "examples": [{"events": [{"at": at, "action": action} for at, action in events]}],
            }
        ],
    }
    index = parse_envelope(recorded("contract-index.stdout"))
    return cache_prefix(
        TeachingSurface(
            index=index,
            projections={"catalog": parse_envelope(projection("catalog", catalog))},
            summaries={"catalog": "What one made-up capability publishes."},
        )
    )


VOCABULARY = take_census(a_prefix_carrying())
"""What a made-up prefix carries before any event is added to it.

The published time vocabulary teaches by example, so its own examples are anchors in any
prefix that carries it. The fixtures below assert what they *add* to that, which is the only
part of the number they are responsible for.
"""


def tally_of(census, form: str):
    """The count the census reports for one published form."""
    return next(count for count in census.anchors.forms if count.form.startswith(form))


def test_it_reports_anchors_by_the_forms_the_contract_publishes() -> None:
    """The vocabulary is the contract's. A form it adds is a form the census counts."""
    census = take_census(cache_prefix(SURFACE))

    assert [count.form for count in census.anchors.forms] == [
        str(form["form"]) for form in TIME["forms"]
    ]
    assert all(count.readable for count in census.anchors.forms)
    assert census.anchors.occurrences == sum(
        count.occurrences for count in census.anchors.forms
    ) + sum(unparsed.occurrences for unparsed in census.anchors.unparsed)


def test_every_anchor_the_catalog_gives_as_an_example_is_one_the_census_reads() -> None:
    """The guard on the scanner. A beat id convention that moved would make it blind."""
    examples = [
        (str(example), "demonstrate")
        for form in TIME["forms"]
        for example in form["examples"]
    ]

    census = take_census(a_prefix_carrying(*examples))

    assert census.anchors.unparsed == ()
    assert census.anchors.occurrences == VOCABULARY.anchors.occurrences + len(examples)


def test_one_idiom_repeated_reports_a_low_distinct_count_against_a_high_raw_one() -> None:
    """The measurement ticket 17 needed and a naive count gets wrong.

    Seven word anchors that walk down one statement teach what one teaches. A census that
    reported seven would hide the defect it was built to expose.
    """
    idiom = take_census(
        a_prefix_carrying(*[(f"b7.word:{word}", "advanceWord") for word in "abcdefg"])
    )
    spread = take_census(
        a_prefix_carrying(
            ("b1.start", "revealAll"),
            ("b2.start", "showBaseline"),
            ("b3.start", "annotate"),
        )
    )

    assert idiom.anchors.occurrences == VOCABULARY.anchors.occurrences + 7
    assert idiom.anchors.statements == VOCABULARY.anchors.statements + 1
    assert spread.anchors.occurrences == VOCABULARY.anchors.occurrences + 3
    assert spread.anchors.statements == VOCABULARY.anchors.statements + 3


def test_an_anchor_shaped_like_nothing_the_contract_publishes_is_reported_as_unparsed() -> None:
    """A silent drop is how a census starts lying."""
    census = take_census(a_prefix_carrying(("b5.mid", "revealAll"), ("b1.start", "revealAll")))

    assert [(item.text, item.occurrences) for item in census.anchors.unparsed] == [("b5.mid", 1)]
    assert tally_of(census, "<beatId>.start").occurrences == (
        tally_of(VOCABULARY, "<beatId>.start").occurrences + 1
    )


def test_it_reports_which_part_of_the_prefix_the_anchors_are_in() -> None:
    """Where the model's attention is being spent is the number most likely to move."""
    census = take_census(a_prefix_carrying(("b2.word:London", "highlightBar")))

    assert [(part.name, part.anchors.occurrences) for part in census.parts] == [
        ("preamble", 0),
        ("catalog", VOCABULARY.anchors.occurrences + 1),
    ]


def test_a_form_no_reader_can_be_built_from_is_reported_rather_than_dropped() -> None:
    """A published form the census cannot read is a hole in the census, and it says so."""
    published = {**TIME, "forms": [*TIME["forms"], {"form": "<beatId>.~~~", "examples": []}]}

    census = take_census(a_prefix_carrying(time=published))

    assert [(count.form, count.readable) for count in census.anchors.forms] == [
        ("<beatId>.start|end", True),
        ("<beatId>.word:<word>", True),
        ("<beatId>.~~~", False),
    ]


def test_a_form_whose_own_examples_the_scanner_cannot_find_is_not_called_readable() -> None:
    """The beat id convention is the crew's own, so being blind to one must be visible.

    A contract that renamed its beats would leave the reader intact and the scanner blind,
    which is the failure a count alone cannot tell from an absence.
    """
    renamed = {
        **TIME,
        "forms": [{**TIME["forms"][0], "examples": ["first-beat.start"]}, TIME["forms"][1]],
    }

    census = take_census(a_prefix_carrying(time=renamed))

    assert [count.readable for count in census.anchors.forms] == [False, True]


SHARED = {
    "means": "One block of published prose, carried in two places, long enough that a reader "
    "would want to be told it is being sent twice on every turn of the loop.",
    "regime": "error",
}
"""Content two categories can both publish, and a document rather than a JSON declaration."""


def a_prefix_of(**contracts: dict) -> CachedPrefix:
    """A prefix over a made-up surface of whatever categories a test needs."""
    index = parse_envelope(recorded("contract-index.stdout"))
    return cache_prefix(
        TeachingSurface(
            index=index,
            projections={
                name: parse_envelope(projection(name, body)) for name, body in contracts.items()
            },
            summaries={name: f"What {name} teaches." for name in contracts},
        )
    )


def test_content_published_in_more_than_one_category_is_reported() -> None:
    """The case that provoked the ticket: one document, sent twice, on every turn.

    The crew cannot fix it — dropping the repeat would be a consumer editing a published
    projection — so noticing is the whole of its part.
    """
    prefix = a_prefix_of(catalog={"checks": SHARED}, checks=SHARED)

    census = take_census(prefix)

    assert [(repeat.copies, repeat.where) for repeat in census.repeats] == [
        (2, ("catalog.checks", "checks"))
    ]
    assert census.repeats[0].chars == len(json.dumps(SHARED, separators=(",", ":")))
    assert census.repeated_chars == census.repeats[0].chars


def test_a_repeat_inside_one_category_is_reported_the_same_way() -> None:
    """A projection that carries its own schema twice spends the prefix exactly as dearly."""
    census = take_census(a_prefix_of(protocol={"report": SHARED, "commands": {"run": SHARED}}))

    assert [repeat.where for repeat in census.repeats] == [
        ("protocol.commands.run", "protocol.report")
    ]


def test_only_the_outermost_repeat_is_reported() -> None:
    """A repeat inside a repeat is the same characters counted twice."""
    census = take_census(
        a_prefix_of(plan={"a": {"inner": SHARED}}, catalog={"b": {"inner": SHARED}})
    )

    assert [repeat.where for repeat in census.repeats] == [("catalog.b", "plan.a")]


def test_the_census_reports_a_repeat_and_never_elides_it() -> None:
    """Reporting is the crew's part. The bodies still go in whole, and the count says so."""
    prefix = a_prefix_of(catalog={"checks": SHARED}, checks=SHARED)

    census = take_census(prefix)

    assert prefix.text.count(json.dumps(SHARED, separators=(",", ":"))) == 2
    assert sum(part.chars for part in census.parts) == census.chars


def test_a_prefix_that_repeats_nothing_reports_nothing() -> None:
    census = take_census(a_prefix_of(plan={"one": SHARED}, catalog={"two": {"of": "something"}}))

    assert census.repeats == ()
    assert census.repeated_chars == 0


RECORD = pathlib.Path(__file__).resolve().parent.parent / "prefix-census.md"
"""Where the durable record lives: beside the project, not inside the suite's temp directory.

The ticket asks that two censuses taken either side of a contract change be comparable without
re-deriving either. This is that record, and the comparison is the diff: the fixtures move only
when the contract moves, so a change here is a change in what the crew is taught.
"""


def test_the_record_names_every_part_and_form_it_found() -> None:
    """What a session reads. Every part of the division and every published form appears."""
    prefix = a_prefix_carrying(("b2.word:London", "highlightBar"))

    rendered = render_prefix_census(take_census(prefix))

    assert "| preamble |" in rendered
    assert "| catalog |" in rendered
    assert "`<beatId>.word:<word>`" in rendered
    assert f"{prefix.chars:,}" in rendered


def test_the_record_is_deterministic_and_is_rewritten_on_every_run() -> None:
    """The record is regenerated, never asserted against.

    Pinning today's counts would make a green suite depend on another team not touching their
    own contract, and that is what the fixtures' own staleness guard is for. What is asserted
    here is the property that makes two records comparable at all: the same prefix renders the
    same bytes, so a diff between two of them is a change in the contract rather than a change
    in the instrument.
    """
    census = take_census(cache_prefix(SURFACE))

    assert render_prefix_census(census) == render_prefix_census(take_census(cache_prefix(SURFACE)))

    RECORD.write_text(render_prefix_census(census), encoding="utf-8", newline="\n")


def test_the_record_lists_the_repeats_that_are_documents_and_totals_the_rest() -> None:
    """A record dominated by `{"type":"string"}` would bury the repeat that matters.

    The floor is on what the record *lists*, never on what the census counts: the value keeps
    every repeat, and the record says how many it did not list and what they come to.
    """
    census = take_census(
        a_prefix_of(
            plan={"a": SHARED, "small": {"type": "string"}},
            catalog={"b": SHARED, "small": {"type": "string"}},
        )
    )
    rendered = render_prefix_census(census)

    assert len(census.repeats) == 2
    assert "`catalog.b`" in rendered
    assert "`catalog.small`" not in rendered
    assert "1 smaller repeat" in rendered
