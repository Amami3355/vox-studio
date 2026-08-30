"""The census as a record a session reads, and a later one diffs against.

Separate from `census.py` because the two change for different reasons. What is counted moves
when the contract moves or when a question about the prefix turns out to be the wrong one; how
it is laid out moves when a session finds the record hard to read. Holding both in one module
meant every wording fix touched the file that owns the numbers.

Markdown rather than JSON because the point of the record is to be read: what a session wants to
know is where the model's attention is being spent, and a diff of two of these says what a
contract change did to that. Deterministic, so a diff is never the instrument's own noise.

This module reads a `PrefixCensus` and writes strings. It measures nothing, and nothing here can
change a number — which is what makes it safe to reword.
"""

from __future__ import annotations

from collections.abc import Sequence

from .census import AnchorTally, PrefixCensus

LISTED_CHARS = 100
"""The floor for *listing* a repeat in the record. Nothing is dropped from the census itself.

Below about a hundred characters a repeat is a property declaration or a JSON literal —
`{"type":"string"}`, twenty-one times — which the schema language obliges and no session can
act on. Listing those buries the case the record exists to show: one document, published twice,
re-sent on every turn. So the record lists the repeats that are documents and says how many
smaller ones it did not list and what they come to, which is a floor on presentation rather
than on measurement: `PrefixCensus.repeats` and `repeated_chars` still carry every one.
"""


def render_prefix_census(census: PrefixCensus) -> str:
    """One census, as the Markdown record `pytest` writes to `prefix-census.md`."""
    return "\n".join(
        [
            *_HEADER,
            f"The prefix is **{census.chars:,} characters**, in "
            f"{len(census.parts) - 1} categories and the crew's own preamble.",
            "",
            "## Where the prefix goes",
            "",
            *_table(
                ["part", "characters", "share", *_forms(census), "unparsed", "statements"],
                [
                    [
                        part.name,
                        f"{part.chars:,}",
                        _share(part.chars, census.chars),
                        *_anchor_cells(part.anchors),
                        str(part.anchors.statements),
                    ]
                    for part in census.parts
                ]
                + [
                    [
                        "**the whole prefix**",
                        f"**{census.chars:,}**",
                        "**100.0%**",
                        *(f"**{cell}**" for cell in _anchor_cells(census.anchors)),
                        f"**{census.anchors.statements}**",
                    ]
                ],
            ),
            "",
            *_ANCHOR_NOTE,
            *_unreadable(census),
            *_unparsed(census),
            "## What it carries more than once",
            "",
            *_REPEAT_NOTE,
            f"**{census.repeated_chars:,} characters** — "
            f"{_share(census.repeated_chars, census.chars)} of the prefix — are copies of "
            f"content published elsewhere in it, across {len(census.repeats)} repeats.",
            "",
            *_table(
                ["characters", "copies", "repeated", "share", "where"],
                [
                    [
                        f"{repeat.chars:,}",
                        str(repeat.copies),
                        f"{repeat.repeated_chars:,}",
                        _share(repeat.repeated_chars, census.chars),
                        ", ".join(f"`{where}`" for where in repeat.where),
                    ]
                    for repeat in census.repeats
                    if repeat.chars >= LISTED_CHARS
                ],
            ),
            "",
            *_unlisted(census),
            *_withheld(census),
        ]
    )


def _withheld(census: PrefixCensus) -> list[str]:
    """What the contract publishes to somebody else, and what it would have cost to teach.

    Its own section, below the accounting and outside every total above it, because none of it
    is sent. It is here so that a document the crew stopped paying for stops being paid for
    visibly: a record that simply went quiet about a category would leave the next session
    unable to tell one that was withheld from one that was never published, and the largest
    duplication anyone has found in this contract lives in the category that left.
    """
    if not census.withheld:
        return []
    lines = [
        "## What the contract publishes elsewhere",
        "",
        *_WITHHELD_NOTE,
        f"**{census.withheld_chars:,} characters** the contract publishes to another audience "
        f"are not assembled into this prefix, across "
        f"{len(census.withheld)} categor{'y' if len(census.withheld) == 1 else 'ies'}. "
        "None of it is counted anywhere above.",
        "",
        *_table(
            ["category", "characters", "would have been", "repeated inside it"],
            [
                [
                    item.name,
                    f"{item.chars:,}",
                    _share(item.chars, census.chars + census.withheld_chars),
                    f"{item.repeated_chars:,}" if item.repeats else "—",
                ]
                for item in census.withheld
            ],
        ),
        "",
    ]
    listed = [
        (item, repeat)
        for item in census.withheld
        for repeat in item.repeats
        if repeat.chars >= LISTED_CHARS
    ]
    if listed:
        lines += [
            "The repeats inside them, on the same outermost-only rule and the same listing "
            "floor. No share, because there is no denominator: this is duplication in a "
            "published contract that no model is charged for.",
            "",
            *_table(
                ["characters", "copies", "repeated", "where"],
                [
                    [
                        f"{repeat.chars:,}",
                        str(repeat.copies),
                        f"{repeat.repeated_chars:,}",
                        ", ".join(f"`{where}`" for where in repeat.where),
                    ]
                    for _, repeat in listed
                ],
            ),
            "",
        ]
    return lines


_HEADER = (
    "# The prefix census",
    "",
    "**Generated by `pytest`, over the recorded contract fixtures. Do not edit by hand.**",
    "",
    "What the crew authors from, measured: the instructions `cache_prefix` assembles, whole,",
    "including the preamble and the per-category framing. Measuring the projections alone would",
    "answer a question nobody asked — the prefix is what reaches a model.",
    "",
    "These numbers are descriptive. Nothing here fails a build: what a balanced prefix looks",
    "like has never been argued, and the contract is another team's to move. What a session can",
    "do is read this beside the one taken before a contract change and see what moved.",
    "",
)

_ANCHOR_NOTE = (
    "Anchor cells read `occurrences (distinct statements)`. The second number is the one that",
    "matters: anchors that differ only in the word they name, sitting in otherwise identical",
    "statements, teach what one of them teaches. A statement here is the object or the sentence",
    "an anchor sits in, with the anchor itself elided.",
    "",
)

_REPEAT_NOTE = (
    "Content the prefix carries in more than one place, byte for byte, outermost repeats only.",
    "Found in the published bodies, where the structure is, and confirmed against the assembled",
    "text before it is reported. Duplication between a body and the crew's preamble or the",
    "per-category framing is not searched for and is not counted here.",
    "The crew does not act on this: dropping a repeat would be a consumer editing a published",
    "projection, which its own assembly rule forbids. Noticing is the whole of its part.",
    "",
)


_WITHHELD_NOTE = (
    "Categories the contract index addresses to an audience the crew is not. They are fetched,",
    "held and read — `refusals.py` and `converge.py` read rules that live here — and they are",
    "never assembled into a prompt. The `would have been` column is the share this category",
    "would have held had it been taught, which is what the crew stopped spending.",
    "",
)


def _share(part: int, whole: int) -> str:
    return f"{100 * part / whole:.1f}%" if whole else "—"


def _table(headers: Sequence[str], rows: Sequence[Sequence[str]]) -> list[str]:
    """A markdown table, or a line saying there is nothing to put in one."""
    if not rows:
        return ["_Nothing._"]
    return [
        "| " + " | ".join(headers) + " |",
        "|" + "|".join(["---"] * len(headers)) + "|",
        *("| " + " | ".join(row) + " |" for row in rows),
    ]


def _forms(census: PrefixCensus) -> list[str]:
    """One column per published form. A pipe in a form string would end the cell early."""
    return [f"`{count.form}`".replace("|", "\\|") for count in census.anchors.forms]


def _anchor_cells(tally: AnchorTally) -> list[str]:
    return [f"{count.occurrences} ({count.statements})" for count in tally.forms] + [
        str(sum(item.occurrences for item in tally.unparsed))
    ]


def _unreadable(census: PrefixCensus) -> list[str]:
    """Forms the census could not read. A hole in the count, named rather than left blank."""
    unread = [count.form for count in census.anchors.forms if not count.readable]
    if not unread:
        return []
    return [
        "**The census could not read these published forms**, so their columns are not a count "
        "of what the prefix demonstrates: " + ", ".join(f"`{form}`" for form in unread) + ".",
        "",
    ]


def _unparsed(census: PrefixCensus) -> list[str]:
    """Anchor-shaped strings no published form reads. Reported, never dropped."""
    if not census.anchors.unparsed:
        return ["Every anchor-shaped string in the prefix is read by a published form.", ""]
    return [
        "Anchor-shaped, and read by no published form: "
        + ", ".join(
            f"`{item.text}` ×{item.occurrences}" for item in census.anchors.unparsed
        )
        + ".",
        "",
    ]


def _unlisted(census: PrefixCensus) -> list[str]:
    """What the table above left out, counted rather than quietly dropped."""
    smaller = [repeat for repeat in census.repeats if repeat.chars < LISTED_CHARS]
    if not smaller:
        return []
    chars = sum(repeat.repeated_chars for repeat in smaller)
    return [
        f"{len(smaller)} smaller repeat{'' if len(smaller) == 1 else 's'}, together "
        f"{chars:,} characters, {_share(chars, census.chars)} of the prefix, are counted in the "
        f"total above and not listed: under {LISTED_CHARS} characters a repeat is a JSON "
        "declaration rather than a document.",
        "",
    ]
