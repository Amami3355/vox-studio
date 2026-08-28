"""A census of the assembled instructions: what the prefix is made of, measured.

Ticket 17 rested an argument, a severity decision and an ADR reading on four numbers about
the prefix the crew authors from, and closed by calling them *"the numbers to re-measure
rather than re-reason about"* — which nothing in the repository could do. This is the
instrument. It reports what the surface demonstrates: how large the prefix is, how it divides
across the categories the index published, how many anchors appear and of which published
forms, how many distinct statements those anchors are spread over, and what content the
prefix carries more than once.

**It is a record, not a gate.** No threshold, no failure on a ratio. What a balanced prefix
looks like has never been argued, and a census that refused a green build because a
capability was added would be the crew holding another team's contract hostage to a number
nobody granted authority to.

The one thing it does assert is its own accounting: that it read the whole prefix and can say
where every character of it went. A census that silently skipped a category would report a
balance over material it had not seen, which is worse than not measuring, so a prefix it
cannot divide is refused rather than reported on.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from .planner import CachedPrefix, anchor_forms, category_part
from .teaching_surface import TeachingSurface

PREAMBLE = "preamble"
"""The crew's own prose, which belongs to no category the contract publishes."""

BEAT_ID = r"[A-Za-z]{1,4}[0-9]+"
"""What a beat id looks like, and the one thing here the census does not read from the contract.

The published forms name their left-hand side `<beatId>` and the plan schema asks only for a
non-empty string, so nothing in the contract says what a beat id is shaped like. Something has
to, or an anchor cannot be told from `contract.show` or `manifestVersion.4`. So this is the
crew's own reading of the convention every beat id in the published material follows, and it is
deliberately wider than the forms themselves: a candidate it finds that no published form can
read is reported as unparsed rather than dropped, which is the whole reason for scanning wider.

A convention that moved would make this blind, so it is not left to trust: `readable` is False
for any form whose own published examples this cannot find, and a test asserts every published
example is read.
"""

STATEMENT = re.compile(r"[{}\[\]\n]|(?<=[.!?])\s+")
"""What separates one statement from the next, in prose and in the compact JSON bodies alike.

The prefix is mostly JSON, so the unit that matters is the object or the sentence an anchor
sits in — `{"at":"b7.word:Nobody","action":"advanceWord"}` is one statement, and the seven of
those that walk down a single typographic statement are one lesson repeated, not seven.
"""

LISTED_CHARS = 100
"""The floor for *listing* a repeat in the record. Nothing is dropped from the census itself.

Below about a hundred characters a repeat is a property declaration or a JSON literal —
`{"type":"string"}`, twenty-one times — which the schema language obliges and no session can
act on. Listing those buries the case the record exists to show: one document, published twice,
re-sent on every turn. So the record lists the repeats that are documents and says how many
smaller ones it did not list and what they come to, which is a floor on presentation rather
than on measurement: `PrefixCensus.repeats` and `repeated_chars` still carry every one.
"""

ANCHOR = "<anchor>"
"""What an anchor is replaced by before statements are compared.

Two statements that differ only in the anchor they carry teach the same thing twice. Eliding
the anchor is what makes that visible, and it is the difference between the count ticket 17
needed and the count that would have hidden the defect.
"""


class CensusIncomplete(RuntimeError):
    """The census could not account for the prefix it was given, so it reports nothing."""


@dataclass(frozen=True, slots=True)
class AnchorCount:
    """One published form, and what the text under census does with it.

    Both numbers are published. `occurrences` is what a reader expects; `statements` is what
    ticket 17 actually needed, and publishing only one of them would re-create the confusion
    that ticket had to work through.
    """

    form: str
    occurrences: int
    statements: int
    readable: bool


@dataclass(frozen=True, slots=True)
class Unparsed:
    """An anchor-shaped string no published form can read."""

    text: str
    occurrences: int


@dataclass(frozen=True, slots=True)
class AnchorTally:
    """What some text demonstrates about the anchor vocabulary."""

    forms: tuple[AnchorCount, ...]
    unparsed: tuple[Unparsed, ...]
    statements: int

    @property
    def occurrences(self) -> int:
        """Every anchor-shaped string found, whether or not a published form could read it."""
        return sum(count.occurrences for count in self.forms) + sum(
            item.occurrences for item in self.unparsed
        )


@dataclass(frozen=True, slots=True)
class Part:
    """One part of the prefix: the preamble, or one category as the prefix carries it."""

    name: str
    chars: int
    anchors: AnchorTally


@dataclass(frozen=True, slots=True)
class Repeat:
    """Content the prefix carries more than once, and where it carries it.

    Measured on content and not on wording. The case on record is byte-identical, and an exact
    check is cheap and produces no false positives; a similarity measure would produce
    arguments instead of numbers.
    """

    chars: int
    where: tuple[str, ...]

    @property
    def copies(self) -> int:
        return len(self.where)

    @property
    def repeated_chars(self) -> int:
        """What the copies after the first cost, on every turn."""
        return self.chars * (self.copies - 1)


@dataclass(frozen=True, slots=True)
class PrefixCensus:
    """What one assembled prefix is made of."""

    chars: int
    parts: tuple[Part, ...]
    anchors: AnchorTally
    repeats: tuple[Repeat, ...]

    @property
    def repeated_chars(self) -> int:
        return sum(repeat.repeated_chars for repeat in self.repeats)

    def render(self) -> str:
        """The census as a record a session reads, and a later one diffs against.

        Markdown rather than JSON because the point of the record is to be read: what a session
        wants to know is where the model's attention is being spent, and a diff of two of these
        says what a contract change did to that. Deterministic, so a diff is never the
        instrument's own noise.
        """
        return "\n".join(
            [
                *_HEADER,
                f"The prefix is **{self.chars:,} characters**, in "
                f"{len(self.parts) - 1} categories and the crew's own preamble.",
                "",
                "## Where the prefix goes",
                "",
                *_table(
                    ["part", "characters", "share", *_forms(self), "unparsed", "statements"],
                    [
                        [
                            part.name,
                            f"{part.chars:,}",
                            _share(part.chars, self.chars),
                            *_anchor_cells(part.anchors),
                            str(part.anchors.statements),
                        ]
                        for part in self.parts
                    ]
                    + [
                        [
                            "**the whole prefix**",
                            f"**{self.chars:,}**",
                            "**100.0%**",
                            *(f"**{cell}**" for cell in _anchor_cells(self.anchors)),
                            f"**{self.anchors.statements}**",
                        ]
                    ],
                ),
                "",
                *_ANCHOR_NOTE,
                *_unreadable(self),
                *_unparsed(self),
                "## What it carries more than once",
                "",
                *_REPEAT_NOTE,
                f"**{self.repeated_chars:,} characters** — "
                f"{_share(self.repeated_chars, self.chars)} of the prefix — are copies of "
                f"content published elsewhere in it, across {len(self.repeats)} repeats.",
                "",
                *_table(
                    ["characters", "copies", "repeated", "share", "where"],
                    [
                        [
                            f"{repeat.chars:,}",
                            str(repeat.copies),
                            f"{repeat.repeated_chars:,}",
                            _share(repeat.repeated_chars, self.chars),
                            ", ".join(f"`{where}`" for where in repeat.where),
                        ]
                        for repeat in self.repeats
                        if repeat.chars >= LISTED_CHARS
                    ],
                ),
                "",
                *_unlisted(self),
            ]
        )


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
    "The crew does not act on this: dropping a repeat would be a consumer editing a published",
    "projection, which its own assembly rule forbids. Noticing is the whole of its part.",
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


def _time(surface: TeachingSurface) -> Mapping[str, Any]:
    """The anchor vocabulary, as the catalog publishes it.

    A surface with no catalog leaves the census with no forms, which is honest: it then reads
    every anchor-shaped string as unparsed rather than inventing a grammar to bless them with.
    """
    if "catalog" not in surface.categories:
        return {}
    return surface.contract("catalog").get("time", {})


def _candidates(time: Mapping[str, Any]) -> re.Pattern[str]:
    """What could be an anchor: a beat id, or the pseudo-beat the contract names, then a tail."""
    scene = str(time.get("sceneBeatId", ""))
    beats = ([re.escape(scene)] if scene else []) + [BEAT_ID]
    return re.compile(r"(?<![\w.])(?:" + "|".join(beats) + r")\.[A-Za-z][\w:+-]*")


def _tally(text: str, time: Mapping[str, Any]) -> AnchorTally:
    """Every anchor in some text, by the form that reads it and the statement it sits in."""
    candidates = _candidates(time)
    readers = anchor_forms(time)
    published = list(time.get("forms", ()))
    occurrences: Counter[str] = Counter()
    statements: dict[str, set[str]] = {form: set() for form, _ in readers}
    unparsed: Counter[str] = Counter()
    seen: set[str] = set()

    for piece in STATEMENT.split(text):
        found = candidates.findall(piece)
        if not found:
            continue
        statement = candidates.sub(ANCHOR, piece)
        seen.add(statement)
        for anchor in found:
            for form, reader in readers:
                if reader is not None and reader.match(anchor):
                    occurrences[form] += 1
                    statements[form].add(statement)
                    break
            else:
                unparsed[anchor] += 1

    return AnchorTally(
        forms=tuple(
            AnchorCount(
                form=form,
                occurrences=occurrences[form],
                statements=len(statements[form]),
                readable=_readable(entry, reader, candidates),
            )
            for (form, reader), entry in zip(readers, published)
        ),
        unparsed=tuple(
            Unparsed(text=anchor, occurrences=count)
            for anchor, count in sorted(unparsed.items())
        ),
        statements=len(seen),
    )


def _readable(form: Any, reader: re.Pattern[str] | None, candidates: re.Pattern[str]) -> bool:
    """Whether the census can find and read this form's own published examples.

    The guard on the scanner. A form whose examples it cannot find is one it would report zero
    of, which is a lie a count alone cannot tell from an absence.
    """
    if reader is None:
        return False
    examples = form.get("examples", ()) if isinstance(form, Mapping) else ()
    return all(
        candidates.fullmatch(str(example)) is not None and reader.match(str(example))
        for example in examples
    )


def _nodes(value: Any, where: str) -> Iterator[tuple[str, str]]:
    """Every object and array in a published body, with the path that reached it.

    Scalars are left out. A description string two capabilities happen to share is JSON
    vocabulary rather than a document sent twice, and reporting it would bury the case that
    matters under hundreds that do not.
    """
    if isinstance(value, Mapping):
        yield where, json.dumps(value, separators=(",", ":"), ensure_ascii=False)
        for key, item in value.items():
            yield from _nodes(item, f"{where}.{key}")
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        yield where, json.dumps(value, separators=(",", ":"), ensure_ascii=False)
        for index, item in enumerate(value):
            yield from _nodes(item, f"{where}.{index}")


def _repeats(surface: TeachingSurface) -> tuple[Repeat, ...]:
    """Content the assembled prefix carries in more than one place.

    Outermost repeats only: a repeat inside a repeat is the same characters counted twice, and
    a census that reported both would inflate its own headline number.

    No threshold. What is too small to care about is a judgement nobody has argued, and the
    ticket's own rule against unargued numbers applies to this one as much as to a ratio that
    fails a build. Reporting only outermost repeats is what keeps the list short without one.
    """
    found: dict[str, list[str]] = {}
    for category in surface.categories:
        for where, blob in _nodes(surface.contract(category), category):
            found.setdefault(blob, []).append(where)
    repeated = {where for places in found.values() if len(places) > 1 for where in places}

    def inside_a_repeat(where: str) -> bool:
        parts = where.split(".")
        return any(".".join(parts[:depth]) in repeated for depth in range(1, len(parts)))

    outermost: list[Repeat] = []
    for blob, places in found.items():
        kept = tuple(sorted(where for where in places if not inside_a_repeat(where)))
        if len(kept) > 1:
            outermost.append(Repeat(chars=len(blob), where=kept))
    return tuple(sorted(outermost, key=lambda repeat: (-repeat.repeated_chars, repeat.where)))


def _divided(prefix: CachedPrefix) -> tuple[tuple[str, str], ...]:
    """The prefix cut into the parts `instructions` assembled it from, or a refusal.

    The parts are found in the assembled text rather than re-derived beside it, so the
    division is over what a model would actually be sent. Everything before the first
    category is the preamble, whatever it says — which is what lets one census read both the
    prefix a scripted author gets and the longer one an author holding the tool gets.
    """
    text = prefix.text
    parts: list[tuple[str, str]] = []
    at = 0
    for category in prefix.surface.categories:
        part = category_part(prefix.surface, category)
        found = text.find(part, at)
        if found < 0:
            raise CensusIncomplete(
                f"The {category} part is not in the prefix as `instructions` assembles it."
            )
        if not parts:
            parts.append((PREAMBLE, text[:found]))
        elif found != at:
            raise CensusIncomplete(
                f"{found - at} characters before the {category} part belong to no part."
            )
        parts.append((category, part))
        at = found + len(part)
    if at != len(text):
        raise CensusIncomplete(
            f"{len(text) - at} characters after the last category belong to no part."
        )
    return tuple(parts)


def take_census(prefix: CachedPrefix) -> PrefixCensus:
    """Measures one assembled prefix. Reads nothing but the text and the surface it holds."""
    time = _time(prefix.surface)
    return PrefixCensus(
        chars=prefix.chars,
        parts=tuple(
            Part(name=name, chars=len(text), anchors=_tally(text, time))
            for name, text in _divided(prefix)
        ),
        anchors=_tally(prefix.text, time),
        repeats=_repeats(prefix.surface),
    )
