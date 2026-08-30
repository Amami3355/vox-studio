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

from .planner import (
    CachedPrefix,
    PublishedForm,
    anchor_forms,
    category_part,
    taught_categories,
)
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
    published = anchor_forms(time)
    occurrences: Counter[str] = Counter()
    statements: dict[str, set[str]] = {form.form: set() for form in published}
    unparsed: Counter[str] = Counter()
    seen: set[str] = set()

    for piece in STATEMENT.split(text):
        found = candidates.findall(piece)
        if not found:
            continue
        statement = candidates.sub(ANCHOR, piece)
        seen.add(statement)
        for anchor in found:
            for form in published:
                if form.reader is not None and form.reader.match(anchor):
                    occurrences[form.form] += 1
                    statements[form.form].add(statement)
                    break
            else:
                unparsed[anchor] += 1

    return AnchorTally(
        forms=tuple(
            AnchorCount(
                form=form.form,
                occurrences=occurrences[form.form],
                statements=len(statements[form.form]),
                readable=_readable(form, candidates),
            )
            for form in published
        ),
        unparsed=tuple(
            Unparsed(text=anchor, occurrences=count)
            for anchor, count in sorted(unparsed.items())
        ),
        statements=len(seen),
    )


def _readable(published: PublishedForm, candidates: re.Pattern[str]) -> bool:
    """Whether the census can find and read this form's own published examples.

    The guard on the scanner. A form whose examples it cannot find is one it would report zero
    of, which is a lie a count alone cannot tell from an absence.
    """
    if published.reader is None:
        return False
    return all(
        candidates.fullmatch(example) is not None and published.reader.match(example)
        for example in published.examples
    )


def _nodes(value: Any, where: tuple[str, ...]) -> Iterator[tuple[tuple[str, ...], str]]:
    """Every object and array in a published body, with the path that reached it.

    Scalars are left out. A description string two capabilities happen to share is JSON
    vocabulary rather than a document sent twice, and reporting it would bury the case that
    matters under hundreds that do not.

    The path is the segments, not a string joined out of them. Nesting is asked about by
    comparing prefixes of it, and a category or key containing a dot would make a joined path
    answer that question wrongly.
    """
    if isinstance(value, Mapping):
        yield where, json.dumps(value, separators=(",", ":"), ensure_ascii=False)
        for key, item in value.items():
            yield from _nodes(item, where + (str(key),))
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        yield where, json.dumps(value, separators=(",", ":"), ensure_ascii=False)
        for index, item in enumerate(value):
            yield from _nodes(item, where + (str(index),))


def _repeats(prefix: CachedPrefix) -> tuple[Repeat, ...]:
    """Content the assembled prefix carries in more than one place.

    Found in the published bodies, structurally: what repeats is a JSON object or array, and
    the flat prefix has no structure to find one in. So it is a search over the projections the
    prefix is assembled from, and what it finds is confirmed against the assembled text before
    it is reported: every blob here is a substring the prefix really carries, as many times as
    it is said to, because `category_part` embeds each body with the same compact serialisation
    this walks. The denominator stays the prefix, so a share is a share of what a model is sent.

    The projections the prefix is assembled from, and not every one the surface holds. A body
    the contract publishes to some other audience is not a repeat a model is sent, and counting
    it would report a cost nobody pays — and the confirmation step above would refuse the whole
    census rather than report it, since that blob is in no prefix to be found in.

    Its one blind spot, named rather than implied: duplication *between* a body and the crew's
    preamble or the per-category framing is invisible to this, because the framing is prose
    that no JSON walk reaches. Nothing has been measured about it either way.

    Outermost repeats only: a repeat inside a repeat is the same characters counted twice, and
    a census that reported both would inflate its own headline number.

    No threshold. What is too small to care about is a judgement nobody has argued, and the
    ticket's own rule against unargued numbers applies to this one as much as to a ratio that
    fails a build. Reporting only outermost repeats is what keeps the list short without one.
    """
    found: dict[str, list[tuple[str, ...]]] = {}
    for category in taught_categories(prefix.surface):
        for where, blob in _nodes(prefix.surface.contract(category), (category,)):
            found.setdefault(blob, []).append(where)
    repeated = {where for places in found.values() if len(places) > 1 for where in places}

    def inside_a_repeat(where: tuple[str, ...]) -> bool:
        return any(where[:depth] in repeated for depth in range(1, len(where)))

    outermost: list[Repeat] = []
    for blob, places in found.items():
        kept = tuple(sorted(".".join(where) for where in places if not inside_a_repeat(where)))
        if len(kept) <= 1:
            continue
        carried = prefix.text.count(blob)
        if carried < len(kept):
            raise CensusIncomplete(
                f"{' and '.join(kept)} repeat content the assembled prefix carries "
                f"{carried} time(s), not {len(kept)}."
            )
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
    for category in taught_categories(prefix.surface):
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
        repeats=_repeats(prefix),
    )
