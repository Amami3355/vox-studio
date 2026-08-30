"""Authoring a VideoPlan from the teaching surface.

This is where a model enters the loop. Everything before it was the crew learning what the
interface publishes; this module turns that into a prompt, asks for a plan, reads what comes
back, and hands it to the sequence `producer.py` already holds.

Five properties in it are load-bearing.

**The instructions are assembled, not written.** They are built from the categories the
contract index published and the bodies those categories carry, so a category the contract
adds is a category the planner teaches with no edit here, and a capability the catalog gains
is one the model can reach for. The only prose of the crew's own is a short framing preamble,
and it speaks the vocabulary the `language` category publishes rather than the repository's.

**No repository vocabulary reaches a model.** `scan_for_leaks` is the proofs' leak-scan
discipline applied to the text of a prompt instead of the contents of a work root, and
`author_plan` runs it as a gate rather than a report: a prompt that leaks raises before an
author is asked anything. The crew is code-blind by convention in this phase, and a prompt is
the easiest place to lose that without noticing.

**What comes back is read in the compiler's own words.** `review` reports findings whose
codes, `means` and `repair` are the ones the published checks contract carries — the crew
names a defect the way the interface names it and does not invent a second vocabulary for the
same thing. The findings do not stop a plan being submitted: the compiler is the only
authority on a plan, and a crew that refused to submit on its own reading would put its
opinion above the interface's. They travel with the Run instead, for the repair loop and the
evidence bundle to read.

**That reading is also offered to the author, as a tool, while it is still drafting.**
`DraftReview` wraps `review` as a callable an author may ask, and `AdkPlanAuthor` binds it onto
the agent it builds. Nothing about the authority moves and no second opinion is invented — it
is the same reading, reached a turn earlier, so a defect the crew can already see costs a tool
call to fix instead of a Run cycle. Two consequences are carried rather than assumed: an ask
holding a tool is answered over several model calls and `context.Ask` counts them, and the
codes an author was shown while drafting are kept on `AuthoredPlan.reviewed` beside the
findings it settled on, which is the only place a reader can see the tool change an outcome.

**A repair is authored, not composed.** `repair_plan` is `author_plan` with what production
said placed after the same instructions, and it runs the same leak gate over the whole text.
The crew writes no prose about a refusal — `refusals.py` gathers the envelope, the report and
the published `means` and `repair` for the codes in it, and the author reads those.

**The instructions are assembled once and kept.** `cache_prefix` builds them, and `author_plan`
and `repair_plan` take that object rather than the surface it was built from — so a turn cannot
assemble a second one, and the catalog is one identical prefix across the whole loop by
construction rather than by two call sites happening to agree. Only the refusal after it
differs from cycle to cycle, which is what makes the prefix one prefix at all. What that does
and does not establish is set out in `context.py`: assembling once is not sending once, the
prefix is transmitted whole on every turn, and what it buys is that measurements either side of
a change are comparable. A provider cache is out of reach here. `authoring_ask`
and `repair_ask` price a turn before it is asked for, so a budget can refuse one rather than
report it.

The live implementation of the author is the only thing here that needs the ADK framework, and
it imports it when it is built rather than when this module is. That is what keeps a bare
`pytest` run free of a network install.
"""

from __future__ import annotations

import json
import re
from abc import ABC, abstractmethod
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import asdict, dataclass, field
from typing import Any

from .client import ProductionClient
from .context import Ask
from .envelopes import ResultEnvelope
from .producer import READ_BACK, ProducedRun, produce
from .refusals import Refusal
from .teaching_surface import AUTHOR, TeachingSurface, read_teaching_surface


class InstructionsLeaked(RuntimeError):
    """Instructions carried repository vocabulary, so they were not sent.

    Carries the violations the scan found. This is a stop rather than a warning: the crew's
    code-blindness is convention in this phase, and the one place it can be lost silently is
    a prompt.
    """


class PlanNotAuthored(RuntimeError):
    """An author answered with something that is not a plan object."""


class PlanNotRepairable(RuntimeError):
    """A refusal reached an author that cannot answer one."""


# What must never appear in a prompt. The repository-side entries mirror the markers the
# proofs scan a work root for; the crew-side ones are this project's own module and class
# names, which are exactly the knowledge an agent is not supposed to have.
#
# Every entry here names something on *this side* of the boundary. Nothing the command surface
# publishes about itself belongs in this list, however filesystem-shaped it looks: the protocol
# contract tells an agent that a plan is submitted as `plan.json`, so scanning for that string
# would fail the crew on its own teaching surface. A test holds the list to that rule by
# scanning every published contract and requiring it to pass.
LEAK_MARKERS: tuple[str, ...] = (
    "sourcesContent",
    "sourceMappingURL",
    "ProductionCommandService",
    "node_modules",
    "packages/production",
    "packages\\production",
    "packages/video",
    "packages\\video",
    "services/agents",
    "services\\agents",
    "ELEVENLABS_API_KEY",
    "VOX_GRANT_KEY",
    "VOX_RUN_HMAC_KEY",
    "GOOGLE_API_KEY",
    "vox_crew",
    "LocalProductionClient",
    "ProductionClient",
    "local_client",
    "teaching_surface",
    "pnpm",
    "vitest",
    ".venv",
    "conftest",
)

# A source file named in a prompt is implementation knowledge whatever the file is called.
LEAK_EXTENSIONS: tuple[str, ...] = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".map")

# Keys that would mean the agent wrote physical time. The compiler is the only writer of it,
# so any of these in an authored plan is a defect regardless of the value beside it.
PHYSICAL_TIME = (
    "frame",
    "duration",
    "safearea",
    "safe_area",
    "timing",
    "fps",
    "second",
    "millisecond",
    "msec",
    "timestamp",
)

# What a resolved reference looks like. An asset requirement is a subject in natural language;
# any of these means the agent resolved it itself instead of describing what it needs.
#
# A bare forward slash is deliberately not one of them. "high/low water" and "before/after" are
# things a subject says, and a check that refused them would train the next author away from
# writing English rather than away from writing paths.
RESOLVED_REFERENCE = re.compile(
    r"^\s*\w+://"  # a URI
    r"|^\s*data:"  # an inline binary
    r"|^\s*[a-z]:[\\/]"  # an absolute path
    r"|^\s*[\\/]"
    r"|\\"  # a Windows separator, which prose does not contain
    r"|\.(?:jpg|jpeg|png|webp|svg|gif|mp4|mov|pdf)\b",  # a file
    re.IGNORECASE,
)


# What counts as one word, for the rule that reads a Beat against a scene's own props.
#
# A word starts and ends on a letter or a digit and may carry apostrophes or hyphens inside it,
# so "Europe's" is one word and the comma after "cities" belongs to none. This is the
# interface's `WORD_PATTERN` restated in the one dialect Python's `re` can express: the catalog
# publishes the anchor *grammar* but never the tokeniser, so there is nothing to read it from.
#
# It is not the only unpublished half of that rule, and saying so here is the point. The token
# bound below, the choice to match whole leaf values rather than tokens, the case fold and the
# spoken-exactly-once predicate are all hand-copied from the compiler too. The drift surface is
# the whole rule rather than this pattern, and what guards it is the cross-implementation test
# that runs both readers over the same two plan files.
WORD = re.compile(r"[^\W_](?:(?:[^\W_]|['’-])*[^\W_])?")

# The widest value the rule will treat as a thing the narrator says, in tokens. The compiler's
# `DEICTIC_CANDIDATE_MAX_TOKENS`, which it takes in turn from the multi-word rule the landing
# check already implements, so the two agree about what "New York" can be anchored to.
DEICTIC_CANDIDATE_MAX_TOKENS = 5


@dataclass(frozen=True, slots=True)
class LeakScan:
    """What a scan over a prompt found. `ok` is the acceptance criterion."""

    violations: tuple[str, ...]

    @property
    def ok(self) -> bool:
        return not self.violations


@dataclass(frozen=True, slots=True)
class Finding:
    """One thing the crew can see about a plan before the compiler is asked.

    `code`, `means` and `repair` are the interface's own, read from the published checks
    contract. `where` and `detail` are the crew's, because only the crew knows which scene it
    was looking at.
    """

    code: str
    where: str
    detail: str
    means: str
    repair: str


@dataclass(frozen=True, slots=True)
class AuthoredPlan:
    """A plan a model wrote, the prompt it was written from, what the crew can see in it, and
    what asking cost.

    `ask` is an account and not a second copy of the prompt: two numbers, the resident prefix
    and what this turn added on top of it. `instructions` is already the text, and a Run
    carrying six of those in an evidence bundle would carry six copies of the catalog.

    **`findings` and `reviewed` answer two different questions, and the pair is the point.**
    `findings` is the reading of the plan the author *settled on* — what it still had wrong when
    it stopped. `reviewed` is every code the author was shown while it drafted. A code in
    `reviewed` and not in `findings` is one the author was told about and fixed before
    answering, which is the only direct evidence there is that holding the tool changed what was
    written rather than merely costing turns.

    `review_calls` is beside them because `reviewed` alone cannot say whether the tool was used.
    An author that called it once and was told nothing was wrong records no codes, which is the
    same empty tuple as an author that never called it at all — two very different things, and
    the first observed on the first run that held the tool. The count separates them.
    """

    plan: Mapping[str, Any]
    instructions: str
    findings: tuple[Finding, ...]
    ask: Ask
    reviewed: tuple[str, ...] = ()
    review_calls: int = 0


@dataclass(frozen=True, slots=True)
class AuthoredRun:
    """One Run, from discovery through authoring to whatever production made of the plan."""

    surface: TeachingSurface
    authored: AuthoredPlan
    produced: ProducedRun

    @property
    def plan(self) -> Mapping[str, Any]:
        return self.authored.plan

    @property
    def instructions(self) -> str:
        return self.authored.instructions

    @property
    def findings(self) -> tuple[Finding, ...]:
        return self.authored.findings


class PlanAuthor(ABC):
    """Whatever turns instructions and a Brief into a VideoPlan.

    Payload-shaped in both directions, and holding no client, no path and no opinion about the
    production sequence: a live implementation talks to a model, a scripted one answers from
    what it was given, and nothing above this interface can tell which it has. That is
    ADR-0015's rule about the deployment seam applied to the model seam, for the same reason —
    an interface that leaked the implementation would have to be unpicked to swap it.

    **`reviews_drafts` is the one thing an author says about itself.** Not which model it is and
    not where it runs — only whether it can call a tool while it drafts, which is the single fact
    the prompt above it has to know: instructions telling an author to call a tool it does not
    hold describe a capability that will never answer. It stays `False` here, so an author that
    says nothing gets exactly the prompt and the accounting it got before any tool existed.
    """

    reviews_drafts: bool = False

    @abstractmethod
    def author(
        self,
        instructions: str,
        brief: Mapping[str, Any],
        *,
        check: Callable[[str], Mapping[str, Any]] | None = None,
    ) -> Mapping[str, Any]:
        """Answers with a VideoPlan for the Brief, authored against the instructions.

        `check` is `DraftReview.tool`'s callable, where the caller offered one. An author that
        holds no tools ignores it; one that does hands it to the model to call before answering.
        It is keyword-only and defaulted so that an author written before tools existed is still
        a valid implementation of this interface.
        """

    @abstractmethod
    def repair(
        self,
        instructions: str,
        brief: Mapping[str, Any],
        plan: Mapping[str, Any],
        refusal: Refusal,
        *,
        check: Callable[[str], Mapping[str, Any]] | None = None,
    ) -> Mapping[str, Any]:
        """Answers with a repaired VideoPlan for the plan production would not take.

        A second method rather than a longer `author`, because a repair is a function of four
        things and authoring is a function of two: an author asked to repair without the plan
        it wrote and what was said about it would be authoring again from scratch, which is
        the one thing a repair may not be. Both are payload-shaped for the same reason —
        `Refusal` carries envelopes and report bodies, and holds no client and no path.
        """


def _preamble(*, drafts_reviewable: bool = False) -> str:
    """The crew's only prose, in the vocabulary the `language` category publishes.

    It says what the model is for and what it may not write, and nothing about how the crew is
    built. Every noun in it — Brief, Beat, Section, SceneInstance, capability, anchor — is a
    term the contract defines, which is what keeps it scannable.

    `drafts_reviewable` follows the author rather than the surface. An author that holds no tool
    must not be told to call one — it would spend the instruction budget describing a capability
    that does not answer, and a scripted Run's prefix would stop being the prefix it has always
    been. So the paragraph is added where the tool is, and nowhere else.
    """
    return (
        "You are the producer on a video production. You are given a Brief and the contract "
        "the production interface publishes about itself, below. Author a VideoPlan for the "
        "Brief and answer with that plan as JSON and nothing else.\n"
        "\n"
        "What you write is semantics. Beats carry their own voice-over text. Sections "
        "partition the Beats and hold the persistent elements and their placements. Each "
        "SceneInstance names a capability the catalog publishes and spans the Beats it plays "
        "over.\n"
        "\n"
        "You do not write physical time. No frames, no durations, no safe areas, no seconds: "
        "every moment is an anchor in one of the published forms. Capability, action, layout "
        "and anchor names come from the catalog below, never from memory — if the catalog "
        "does not publish it, it does not exist. Asset requirements are a subject in natural "
        "language with a treatment and an orientation, never a file, a URL or an image.\n"
        + (
            "\n"
            "Before you answer, call `review_draft` with the plan you are about to give, and "
            "read what it reports. It answers from this same contract and costs the production "
            "nothing. Repair what it names and call it again. An empty report is not an "
            "acceptance — it is a reading that found nothing, and the production interface is "
            "the only authority on a plan.\n"
            "\n"
            "This is also how a word anchor stops being a gamble. Whether a Beat speaks a word "
            "exactly once, and whether a pointing action lands on the value it names, are both "
            "answerable from the plan alone — so reach for the pointing action when there is "
            "something to point at, and check the anchor here before you commit to it.\n"
            if drafts_reviewable
            else ""
        )
    )


def taught_categories(surface: TeachingSurface) -> tuple[str, ...]:
    """The categories the prefix is assembled from: the ones addressed to an author.

    Public, and the single answer to that question. `instructions` builds the prefix out of
    these and `census.py` divides the prefix by exactly these, and two call sites that each
    decided for themselves would be one edit away from disagreeing about what the prefix is.

    The crew adds nothing to the contract's answer. It does not know that `protocol` is the
    category an author cannot act on; it knows that it is an author, and the index says which
    categories are published to one. Everything discovery fetched is still held — `refusals.py`
    and `converge.py` read categories no prompt carries — so what narrows here is the prompt,
    not the surface.
    """
    return surface.addressed_to(AUTHOR)


def instructions(surface: TeachingSurface, *, drafts_reviewable: bool = False) -> str:
    """Assembles the prompt from the categories addressed to an author, in the index's order.

    The bodies go in whole. They are what the plan is authored against, and a summary of a
    catalog is a description of capabilities the model then cannot name correctly. They go in
    compact, the way the envelopes themselves are framed: the catalog is the largest thing in
    this prompt by a wide margin and indenting it buys a model nothing it cannot already read.

    Whole, and every one of them: the rule that a category the contract adds is a category the
    crew teaches with no edit here is unchanged, and it is now the contract that says which
    categories those are. A crew that kept its own list of what to send would be the thing that
    rule exists to prevent, arrived at from the other direction.
    """
    parts = [_preamble(drafts_reviewable=drafts_reviewable)]
    parts.extend(category_part(surface, category) for category in taught_categories(surface))
    return "".join(parts)


def category_part(surface: TeachingSurface, category: str) -> str:
    """One category's contribution to the prefix — its framing, summary and body, as placed.

    Public because `census.py` divides the assembled prefix by exactly these parts, and a
    second copy of this framing over there would be one edit away from disagreeing with this
    one about where a category begins and how much of the prefix it is.
    """
    return (
        f"\n## {category}\n\n{surface.summary(category)}\n\n"
        "```json\n"
        + json.dumps(surface.contract(category), separators=(",", ":"), ensure_ascii=False)
        + "\n```\n"
    )


@dataclass(frozen=True, slots=True)
class CachedPrefix:
    """The teaching surface assembled into instructions once, and kept for a whole Run.

    Every turn of the repair loop is authored against this same object, which is what makes the
    catalog one identical prefix rather than five identical rebuilds — and two call sites that
    each assembled their own would be one edit away from disagreeing about what "identical"
    meant. The cache is this process's own: one assembly, held. Nothing about it reaches a
    provider, and `context.py` is where that is set out.

    It carries the surface it was built from because everything downstream of authoring needs
    both: `review` reads the catalog out of the surface, and `refusals.py` reads the checks and
    protocol categories out of it. Passing them separately would let a Run review a plan against
    a surface its instructions were not built from.
    """

    surface: TeachingSurface
    text: str

    @property
    def chars(self) -> int:
        return len(self.text)


def cache_prefix(surface: TeachingSurface, *, drafts_reviewable: bool = False) -> CachedPrefix:
    """Assembles the instructions, once. The only place a Run's prompt prefix is built.

    `drafts_reviewable` is the author's answer, not the surface's — see `_preamble`. It is a
    property of the prefix rather than of each turn because both turns of the repair loop are
    authored against the same object, and a prefix that described the tool on one turn and not
    the other would stop being one identical prefix.
    """
    return CachedPrefix(
        surface=surface, text=instructions(surface, drafts_reviewable=drafts_reviewable)
    )


def _markers(lowered: str) -> list[str]:
    """Every marker the text names. Case-insensitive, and the half both scans share."""
    return [f"marker:{marker}" for marker in LEAK_MARKERS if marker.lower() in lowered]


def scan_for_leaks(text: str) -> LeakScan:
    """The proofs' leak-scan discipline, over a prompt instead of a work root.

    Case-insensitive, because a marker that only matched one casing would be a scan that
    passed on the thing it exists to catch.
    """
    lowered = text.lower()
    named = r"\b[\w.-]+(?:" + "|".join(re.escape(item) for item in LEAK_EXTENSIONS) + r")\b"
    violations = _markers(lowered)
    violations += [f"source-file:{match}" for match in re.findall(named, lowered)]
    if re.search(r"\b[a-z]:[\\/]", lowered):
        violations.append("absolute-path")
    return LeakScan(tuple(dict.fromkeys(violations)))


def scan_message_for_leaks(*parts: Any) -> LeakScan:
    """The scan over the other half of a prompt: the Brief, and the plan handed back with it.

    `scan_for_leaks` guards the instructions, which the crew assembles out of repository-side
    material and which are therefore where a leak would originate. The task message is not
    that material — a Brief is prose an operator wrote, and a plan is the model's own previous
    answer returned unedited — so only the markers run over it.

    The file-shaped and absolute-path heuristics deliberately do not. They read English as
    evidence, and a Brief that says "Node.js" is not a leak; refusing one would train this
    project's operators away from writing Briefs rather than away from leaking. The markers
    are a different matter: `VOX_GRANT_KEY` or a `packages/production` path can reach a Brief
    by accident, and this is the last place before a model sees it.
    """
    lowered = json.dumps(parts, ensure_ascii=False, default=str).lower()
    return LeakScan(tuple(dict.fromkeys(_markers(lowered))))


def message_text(message: Mapping[str, Any]) -> str:
    """The half of a prompt the crew hands over beside the instructions, as it is sent.

    One serialisation rather than two. `AdkPlanAuthor` sends exactly this string and the ask
    measures exactly this string, so a Run's account is the text that reached the model rather
    than an estimate of it. Compact, for the reason `instructions` is compact: the framing
    whitespace buys a model nothing it cannot already read, and here it would be whitespace
    billed once per repair cycle.
    """
    return json.dumps(message, separators=(",", ":"), ensure_ascii=False)


def _walk(value: Any, where: str) -> Iterator[tuple[str, str]]:
    """Every key in a plan, with the path that reached it."""
    if isinstance(value, Mapping):
        for key, item in value.items():
            yield where, str(key)
            yield from _walk(item, f"{where}.{key}")
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        for index, item in enumerate(value):
            yield from _walk(item, f"{where}[{index}]")


def _anchor_pattern(time: Mapping[str, Any]) -> re.Pattern[str]:
    """Builds the anchor reader from the forms the catalog publishes.

    The edge names and the word prefix are taken from the form strings and the offset tokens
    from `offsets`, so the crew reads the anchors the contract currently describes rather than
    the ones it described when this was written. A form this cannot parse is left out, which
    a test catches by holding every published example to the pattern.
    """
    return _anchor_reader("|".join(tail for _, tail, _ in _tails(time) if tail))


@dataclass(frozen=True, slots=True)
class PublishedForm:
    """One anchor form as the catalog publishes it, with the reader built from its tail.

    The three travel together because every caller needs all three: the form string to report
    by, the reader to count with, and the examples to check the reader against. A caller given
    only the first two has to go back to the contract for the third, and then there are two
    readers of the form entry's shape, one edit away from disagreeing.

    `reader` is `None` for a form no grammar could be built from — reported as unread rather
    than counted as zero.
    """

    form: str
    reader: re.Pattern[str] | None
    examples: tuple[str, ...]


def anchor_forms(time: Mapping[str, Any]) -> tuple[PublishedForm, ...]:
    """Every form the catalog publishes, in the order it publishes them, each with its reader.

    One reader per form rather than the single combined one above, because `census.py` reports
    anchors *by form* and a combined reader cannot say which form it matched. A form no reader
    can be built from comes back with `reader=None` rather than being left out of the list: a
    caller can then report it as unread, and a form silently dropped is how a census starts
    lying.

    The published `examples` travel with the reader built from them. A caller that had to fetch
    them itself would be a second reader of the form entry's shape — which is the disagreement
    this function was extracted to prevent, re-created one level up.
    """
    return tuple(
        PublishedForm(
            form=form,
            reader=_anchor_reader(tail) if tail else None,
            examples=examples,
        )
        for form, tail, examples in _tails(time)
    )


def _anchor_reader(alternatives: str) -> re.Pattern[str]:
    """One anchor grammar, whether it carries every published form or only one."""
    return re.compile(r"^(?P<beat>[^.]+)\.(?:" + alternatives + r")$")


def _tails(time: Mapping[str, Any]) -> tuple[tuple[str, str, tuple[str, ...]], ...]:
    """Each published form string, the pattern its tail becomes, and its published examples.

    An empty tail means unreadable, and an unreadable form reaches no reader: `_anchor_pattern`
    drops it from the combined grammar and `anchor_forms` hands it back with `reader=None`.
    """
    offsets = "|".join(re.escape(str(token)) for token in time.get("offsets", ()))
    published = []
    for form in time.get("forms", ()):
        if not isinstance(form, Mapping):
            # A form entry that is not an object is one this cannot read. Named, so a census
            # can report it as unread, but with an empty tail so it widens no grammar:
            # ADR-0009 binds the reader to what the contract publishes as a form, and a bare
            # string here would otherwise have its tail taken as an edge name.
            published.append((str(form), "", ()))
            continue
        name = str(form.get("form", ""))
        examples = tuple(str(example) for example in form.get("examples", ()))
        tail = name.split(".", 1)[-1]
        if tail.startswith("word:"):
            published.append((name, r"word:\S.*", examples))
            continue
        edges = sorted(re.escape(part) for part in tail.split("|") if part.isalpha())
        if not edges:
            published.append((name, "", examples))
            continue
        edge = "(?:" + "|".join(edges) + ")"
        published.append(
            (name, edge + (f"(?:[+-](?:{offsets}))?" if offsets else ""), examples)
        )
    return tuple(published)


def published_errors(surface: TeachingSurface) -> Mapping[str, Any]:
    """The check registry's error half, as the contract publishes it."""
    return surface.contract("checks").get("errors", {})


def published_warnings(surface: TeachingSurface) -> Mapping[str, Any]:
    """The check registry's warning half, as the contract publishes it.

    A second reader beside `published_errors` rather than one that merges the two, because the
    regimes are distinct and the interface keeps them so: an error is a plan production will not
    take and a warning is a plan it will take and think less of. Flattening them here would let
    a finding built from a warning read as a refusal to whichever caller forgot to ask.
    """
    return surface.contract("checks").get("warnings", {})


def _tokens(text: str) -> list[str]:
    """A beat's words, split the way the interface splits them."""
    return WORD.findall(text or "")


def _leaf_strings(value: Any) -> Iterator[str]:
    """Every complete leaf string of an authored props object.

    Complete leaves rather than tokens: a headline is three or more tokens that are not spoken
    verbatim, a chart label is a leaf that is, and matching tokens instead would report the
    former on nothing but its stop-words.
    """
    if isinstance(value, str):
        yield value
    elif isinstance(value, Mapping):
        for item in value.values():
            yield from _leaf_strings(item)
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        for item in value:
            yield from _leaf_strings(item)


def _declined_gesture(
    scene: Mapping[str, Any], capability: Mapping[str, Any], text_of: Mapping[str, str]
) -> list[str]:
    """The word anchors a scene could have pointed at, and did not. Empty when it did.

    The compiler's rule, over the manifest the crew was taught from rather than over the
    registry the compiler holds. `deicticFields` is published per action, which is what lets
    this be one rule for every capability instead of a list of verbs kept in step by hand — a
    capability that ships a new pointing action is covered by both readers on the day it lands.

    The three conditions are the compiler's, in its order, and the third is the rule. It asks
    whether the scene's own props name something the narration actually speaks, which is the
    difference between "this scene did not point" and "this scene had something to point at".

    Matched case-insensitively and reported in the beat's own casing, which is one decision and
    not two. A beat saying "the harbour battery" over props saying "Harbour battery" is a scene
    that can point, so a case-sensitive match would miss it; but a word anchor resolves exactly,
    so an anchor spelled the way the payload spells it would be a suggestion that refuses. A
    word the beat speaks twice yields nothing, for the same reason: `AMBIGUOUS_ANCHOR` is
    waiting for it.
    """
    pointing = {
        str(action["id"])
        for action in capability.get("actions", ())
        if isinstance(action, Mapping) and "id" in action and action.get("deicticFields")
    }
    if not pointing:
        return []

    events = [event for event in scene.get("events", ()) or () if isinstance(event, Mapping)]
    if not events:
        return []
    if any(str(event.get("action", "")) in pointing for event in events):
        return []

    values = list(_leaf_strings(scene.get("props")))
    offered: list[str] = []

    for beat in scene.get("spansBeats", ()) or ():
        spoken = _tokens(text_of.get(str(beat), ""))
        lowered = [word.lower() for word in spoken]

        for value in values:
            tokens = [word.lower() for word in _tokens(value)]
            if not tokens or len(tokens) > DEICTIC_CANDIDATE_MAX_TOKENS:
                continue
            if any(lowered.count(token) != 1 for token in tokens):
                continue
            offered += [f"{beat}.word:{spoken[lowered.index(token)]}" for token in tokens]

    return list(dict.fromkeys(offered))


def _published_finding(
    published: Mapping[str, Any], code: str, where: str, detail: str
) -> Finding:
    """One finding, carrying the `means` and `repair` the registry publishes for its code.

    The lookup lives here rather than at each caller because a `Finding` built without it is a
    code with its contract stripped off. That is precisely what the crew refuses to accept from
    the interface, and the draft-review tool was building `MALFORMED_PLAN` that way — telling an
    author, in the one case where its draft would not even parse, a code and nothing to do about
    it, while the tool's own docstring promised it the `means` and the `repair`.
    """
    meaning = published.get(code, {})
    return Finding(
        code=code,
        where=where,
        detail=detail,
        means=str(meaning.get("means", "")),
        repair=str(meaning.get("repair", "")),
    )


def review(plan: Mapping[str, Any], surface: TeachingSurface) -> tuple[Finding, ...]:
    """Reads an authored plan against the catalog it was supposed to be authored from.

    This is not a second compiler and does not try to be one — it covers what the instructions
    are responsible for teaching, which is the part a Run should not have to be spent
    discovering. Everything else is the compiler's to say.
    """
    catalog = surface.contract("catalog")
    published = published_errors(surface)
    warned = published_warnings(surface)
    text_of = {
        str(beat["id"]): str(beat.get("text", ""))
        for beat in plan.get("beats", ()) or ()
        if isinstance(beat, Mapping) and "id" in beat
    }
    capabilities = {
        str(item["id"]): item
        for item in catalog.get("capabilities", ())
        if isinstance(item, Mapping) and "id" in item
    }
    anchor = _anchor_pattern(catalog.get("time", {}))
    scene_beat = str(catalog.get("time", {}).get("sceneBeatId", "scene"))
    findings: list[Finding] = []

    def report(code: str, where: str, detail: str) -> None:
        findings.append(_published_finding(published, code, where, detail))

    def note(code: str, where: str, detail: str) -> None:
        """A finding whose code the registry publishes as a warning rather than an error.

        The same `Finding`, and deliberately so: what a code costs the plan is the interface's
        to say and the crew has never sorted findings by regime. What moves is only where the
        `means` and the `repair` are read from, and reading a warning out of `errors` would
        hand the author a code with its contract stripped off.
        """
        findings.append(_published_finding(warned, code, where, detail))

    for where, key in _walk(plan, "plan"):
        lowered = key.lower()
        if any(word in lowered for word in PHYSICAL_TIME):
            report("MALFORMED_PLAN", f"{where}.{key}", f"{key} is physical time, not semantics.")

    for section in plan.get("sections", ()) or ():
        if not isinstance(section, Mapping):
            continue
        at = f"plan.sections[{section.get('id', '?')}]"
        for element in section.get("persistent", ()) or ():
            if isinstance(element, Mapping):
                _read_asset(element.get("assetRequirement"), f"{at}.persistent", report)
                _read_anchors(
                    element.get("placements", ()),
                    anchor,
                    scene_beat,
                    section.get("spansBeats", ()) or (),
                    f"{at}.persistent",
                    report,
                )
        for scene in section.get("scenes", ()) or ():
            if not isinstance(scene, Mapping):
                continue
            here = f"{at}.scenes[{scene.get('id', '?')}]"
            component = str(scene.get("component", ""))
            capability = capabilities.get(component)
            if capability is None:
                report(
                    "UNKNOWN_CAPABILITY",
                    f"{here}.component",
                    f"{component!r} is not a capability the catalog publishes.",
                )
                continue
            props = scene.get("props")
            if isinstance(props, Mapping):
                _read_asset(props.get("assetRequirement"), f"{here}.props", report)
            actions = {
                str(action["id"])
                for action in capability.get("actions", ())
                if isinstance(action, Mapping) and "id" in action
            }
            spans = scene.get("spansBeats", ()) or ()
            for index, event in enumerate(scene.get("events", ()) or ()):
                if not isinstance(event, Mapping):
                    continue
                named = str(event.get("action", ""))
                if named not in actions:
                    report(
                        "UNKNOWN_ACTION",
                        f"{here}.events[{index}].action",
                        f"{named!r} is not an action {component} publishes.",
                    )
            _read_anchors(
                scene.get("events", ()) or (),
                anchor,
                scene_beat,
                spans,
                f"{here}.events",
                report,
            )

            offered = _declined_gesture(scene, capability, text_of)
            if offered:
                note(
                    "DEICTIC_OPPORTUNITY_MISSED",
                    f"{here}.events",
                    f"This scene used none of {component}'s pointing actions, and its props "
                    f"name values its beats speak. It could have pointed at: "
                    f"{', '.join(offered)}.",
                )

    return tuple(findings)


@dataclass(slots=True)
class DraftReview:
    """`review`, offered to an author as a tool it may call before answering — and its meter.

    The reading itself is unchanged and shared: this is the same `review` the crew has always
    run over a finished plan, reached one turn earlier. What is new is *when* an author can see
    it. Until now the findings were computed after the author had answered and travelled with
    the Run for the repair loop and the bundle to read, which meant the one reader who could
    still act on them cheaply — the author, still drafting — was the one reader who never saw
    them. A plan reached the interface carrying defects the crew had already spotted.

    Nothing about the authority moves. `review` is advisory here for exactly the reason it is
    advisory everywhere else: the compiler is the only authority on a plan, and an empty report
    is a reading that found nothing rather than an acceptance. What the tool changes is the cost
    of acting on a finding, from a Run cycle to a tool call.

    **It is also the meter, and that is not incidental.** Every call the author makes is a
    further model call that re-sends the whole prefix, so the object that provides the tool is
    the only one positioned to count them honestly. `context.Ask` multiplies by `model_calls`,
    and a turn that under-reported its own spend would put a wrong number in a bundle that is
    evidence.
    """

    surface: TeachingSurface
    offered: bool = True
    calls: int = 0
    returned_chars: int = 0
    codes: list[str] = field(default_factory=list)

    @property
    def model_calls(self) -> int:
        """Model calls this ask made: the first, plus one to read each tool answer."""
        return 1 + self.calls

    def check(self) -> Callable[[str], Mapping[str, Any]] | None:
        """The tool this author was offered, or `None` where it holds none.

        A meter is built for every turn so that every turn's account has one shape. Whether the
        author can *reach* the tool is this method's answer, and an author that cannot leaves
        the meter reading zero rather than leaving it absent.
        """
        return self.tool() if self.offered else None

    def tool(self) -> Callable[[str], Mapping[str, Any]]:
        """The callable an author is given. Its docstring is what the model reads."""

        def review_draft(plan: str) -> Mapping[str, Any]:
            """Reads a draft VideoPlan against the published contract and reports what it finds.

            Call this before answering, with the plan you are about to give. Each finding names
            a check `code` the contract publishes, what that code `means`, the `repair` the
            contract states for it, and where in the plan it was found. Repair what it names
            and call this again.

            An empty `findings` list means this reading found nothing. It is not an acceptance:
            the production interface remains the only authority on a plan, and this reading
            covers only what the contract above is responsible for teaching.

            Args:
                plan: the draft VideoPlan, as JSON text.

            Returns:
                `findings`, and `clean` when there are none.
            """
            self.calls += 1
            try:
                draft = _plan_from(plan)
            except PlanNotAuthored as error:
                found = (
                    _published_finding(
                        published_errors(self.surface), "MALFORMED_PLAN", "plan", str(error)
                    ),
                )
            else:
                found = review(draft, self.surface)
            self.codes.extend(finding.code for finding in found)
            answer = {"findings": [asdict(finding) for finding in found], "clean": not found}
            self.returned_chars += len(json.dumps(answer, separators=(",", ":")))
            return answer

        return review_draft


def _read_anchors(
    items: Any,
    anchor: re.Pattern[str],
    scene_beat: str,
    spans: Any,
    where: str,
    report: Callable[[str, str, str], None],
) -> None:
    """Holds every `at` to a published form, and to a beat its scene actually spans."""
    reachable = {str(beat) for beat in spans} | {scene_beat}
    for index, item in enumerate(items or ()):
        if not isinstance(item, Mapping) or "at" not in item:
            continue
        at = item["at"]
        if not isinstance(at, str):
            report(
                "MALFORMED_PLAN",
                f"{where}[{index}].at",
                f"{at!r} is physical time, not an anchor.",
            )
            continue
        match = anchor.match(at)
        if match is None:
            report(
                "UNKNOWN_ANCHOR",
                f"{where}[{index}].at",
                f"{at!r} is not one of the forms catalog.time publishes.",
            )
        elif match.group("beat") not in reachable:
            report(
                "UNKNOWN_ANCHOR",
                f"{where}[{index}].at",
                f"{at!r} names a beat outside the ones its scene spans.",
            )


def _read_asset(
    requirement: Any, where: str, report: Callable[[str, str, str], None]
) -> None:
    """An asset requirement says what is needed, never which file would satisfy it."""
    if not isinstance(requirement, Mapping):
        return
    subject = requirement.get("subject")
    if isinstance(subject, str) and RESOLVED_REFERENCE.search(subject):
        report(
            "MALFORMED_PLAN",
            f"{where}.assetRequirement.subject",
            f"{subject!r} is a resolved reference, not a subject.",
        )


def _refuse_if_leaked(text: str, what: str, *parts: Any) -> None:
    """Refuses to send a prompt that carries repository vocabulary, in either half.

    Raised rather than scrubbed. A prompt that had to be edited on its way out is a prompt
    whose builder is wrong, and editing it here would hide that from whoever reads the run.
    """
    found = scan_for_leaks(text).violations + scan_message_for_leaks(*parts).violations
    scan = LeakScan(tuple(dict.fromkeys(found)))
    if not scan.ok:
        raise InstructionsLeaked(
            f"The {what} carry repository vocabulary and were not sent: "
            + ", ".join(scan.violations)
        )


def _as_plan(answered: Any, verb: str) -> Mapping[str, Any]:
    """What an author said, once it is known to be a plan object and not something else."""
    if not isinstance(answered, Mapping):
        raise PlanNotAuthored(f"An author {verb} with {type(answered).__name__}, not a plan.")
    return answered


def authoring_ask(prefix: CachedPrefix, brief: Mapping[str, Any]) -> Ask:
    """What asking for a plan will cost, priced before anything is asked.

    Public and separate from `author_plan` so a budget can be consulted *before* the money is
    spent rather than after. The alternative — the caller adding up the same two lengths — is
    the rule written twice, and the copy that could allow a turn the finished bundle then
    reports as an overrun.

    **This is a floor where the author holds a tool**, and it cannot be anything else: how many
    times an author will call one is not knowable before it is asked. `author_plan` records what
    the turn actually cost by reading the meter afterwards. A budget consulted here is therefore
    reading the cheapest the turn can be, which is the direction a budget wants to be wrong in —
    the same choice `context.CHARS_PER_TOKEN` makes for the same reason.
    """
    return Ask(resident=prefix.chars, fresh=len(message_text(brief)))


def _offered(prefix: CachedPrefix, author: PlanAuthor) -> DraftReview:
    """A fresh meter for this turn, whether or not the author can reach the tool.

    Fresh per turn rather than per Run, because an `Ask` is what one turn cost and a meter
    shared across the loop would charge the second turn for the first turn's tool calls.

    Built for every author rather than only for one holding a tool. An author that cannot call
    the tool leaves the meter reading zero, which is the same answer an author that could and
    did not leaves — so no caller has to ask which kind it is holding, and the four places that
    asked have one shape between them.

    **The meter keeps that single shape, and does not distinguish "asked nothing" from "could
    not ask".** Crew ticket 24 wants the bundle to tell those apart and this was the obvious
    place to put it; it is the wrong place. A meter answers what a turn spent, and both of those
    turns spent nothing — the difference between them is a fact about the *author*, which the
    author already states as `reviews_drafts` and which `cache_prefix` already reads to decide
    what the prompt says. Teaching the meter a second question would put that fact in two places
    and make one of them derived, and the derived one is where they would disagree.

    So the bundle carries it from the author's own answer rather than from the meter, and ticket
    24's criterion is amended to say so. Settled here, in the module the meter lives in, because
    the alternative was two tickets landing with opposite assumptions and a reader discovering it
    in a bundle.
    """
    return DraftReview(prefix.surface, offered=author.reviews_drafts)


def _reviewed(meter: DraftReview) -> tuple[str, ...]:
    """Every code the author was shown while drafting, in the order it was shown them.

    Order is kept rather than a set taken: the same code twice means the author was told, wrote
    something else, and was told again, which reads very differently from being told once.
    """
    return tuple(meter.codes)


def _spent(priced: Ask, meter: DraftReview) -> Ask:
    """The ask as it actually happened: the price it was quoted, plus what the tool cost.

    The two costs are carried apart because they behave differently. Every call re-sent the
    prefix *and* the message beside it, so `Ask` multiplies both by `model_calls`; a tool's
    answer appears only in the calls after the one that asked for it, so it is handed over as
    `returned` and charged on its own line. Folding the answers into `fresh` — which this did
    at first — charged them once and charged the Brief once, and the Brief is the larger of the
    two.
    """
    if meter.calls == 0:
        return priced
    return Ask(
        resident=priced.resident,
        fresh=priced.fresh,
        model_calls=meter.model_calls,
        returned=meter.returned_chars,
    )


def repair_ask(
    prefix: CachedPrefix,
    brief: Mapping[str, Any],
    plan: Mapping[str, Any],
    refusal: Refusal,
) -> Ask:
    """What asking for this repair will cost, priced before it is asked for.

    Every term is known in advance: the refusal is already gathered and the plan is already
    written, so a repair can be budgeted rather than regretted.
    """
    return Ask(
        resident=prefix.chars,
        fresh=len(refusal.as_text()) + len(message_text({"brief": brief, "plan": plan})),
    )


def author_plan(
    prefix: CachedPrefix, brief: Mapping[str, Any], author: PlanAuthor
) -> AuthoredPlan:
    """Scans the cached instructions, asks for a plan, and reads what came back.

    Takes the prefix rather than the surface, so authoring cannot assemble a prompt of its own.
    An authoring turn adds nothing to it: what is fresh is the Brief, and the ask says so.
    """
    _refuse_if_leaked(prefix.text, "instructions", brief)

    meter = _offered(prefix, author)
    plan = _as_plan(author.author(prefix.text, brief, check=meter.check()), "answered")
    return AuthoredPlan(
        plan=plan,
        instructions=prefix.text,
        findings=review(plan, prefix.surface),
        ask=_spent(authoring_ask(prefix, brief), meter),
        reviewed=_reviewed(meter),
        review_calls=meter.calls,
    )


def repair_plan(
    prefix: CachedPrefix,
    brief: Mapping[str, Any],
    plan: Mapping[str, Any],
    refusal: Refusal,
    author: PlanAuthor,
) -> AuthoredPlan:
    """`author_plan` again, with what production said after the same instructions.

    Deliberately the same shape and the same gate. The scan runs over the whole text, not only
    over the part `cache_prefix` built, because the refusal is new text reaching a model and a
    prompt is where code-blindness is lost quietly — that argument does not weaken because the
    new text came from the service.

    The refusal goes *after* the prefix rather than in front of it, and that ordering is what
    makes the prefix a prefix. Text placed before the catalog would differ from cycle to cycle,
    so no two turns would share an opening and there would be nothing identical left to compare
    a measurement against — which is the whole property the assembled prefix earns its place on.
    """
    said = refusal.as_text()
    text = prefix.text + said
    _refuse_if_leaked(text, "repair instructions", brief, plan)

    meter = _offered(prefix, author)
    repaired = _as_plan(
        author.repair(text, brief, plan, refusal, check=meter.check()), "repaired"
    )
    return AuthoredPlan(
        plan=repaired,
        instructions=text,
        findings=review(repaired, prefix.surface),
        ask=_spent(repair_ask(prefix, brief, plan, refusal), meter),
        reviewed=_reviewed(meter),
        review_calls=meter.calls,
    )


def plan_and_produce(
    client: ProductionClient,
    request: Mapping[str, Any],
    author: PlanAuthor,
    *,
    on_envelope: Callable[[ResultEnvelope], None] | None = None,
    read_back: Sequence[str] = READ_BACK,
) -> AuthoredRun:
    """Discovery, authoring, then the sequence `produce` already holds.

    A refusal is a successful outcome here: it comes back on `produced.refusal` with the
    report the repair loop is built from, and nothing raises.
    """
    surface = read_teaching_surface(client, on_envelope)
    prefix = cache_prefix(surface, drafts_reviewable=author.reviews_drafts)
    authored = author_plan(prefix, request.get("brief", {}), author)
    produced = produce(
        client, request, authored.plan, on_envelope=on_envelope, read_back=read_back
    )
    return AuthoredRun(surface=surface, authored=authored, produced=produced)


@dataclass(frozen=True, slots=True)
class HandedPlanAuthor(PlanAuthor):
    """An author for a plan the crew did not write: it answers with the one it was handed.

    This is the seam's third implementation and the only scripted one that ships, because it is
    what makes a whole Run reproducible on a machine holding no model credential. Everything
    around the model is still the crew's — discovery, the review, the convergence, the producer,
    the read-back and the bundle — and the one non-deterministic party is replaced by a plan an
    operator wrote. A Run driven this way is not the crew authoring; a bundle says so by
    reporting the authorship it was given rather than inferring one.

    `review` still runs over the handed plan, so an operator who hands in something the catalog
    would not serve reads the same findings a model would have earned.
    """

    plan: Mapping[str, Any]

    def author(
        self,
        instructions: str,
        brief: Mapping[str, Any],
        *,
        check: Callable[[str], Mapping[str, Any]] | None = None,
    ) -> Mapping[str, Any]:
        """The handed plan, unread and unreviewed.

        `check` is accepted and deliberately not called. A handed plan is an operator's, and a
        tool call here would spend a turn arriving at findings `author_plan` computes over the
        same plan a moment later anyway — the same findings, reported twice.
        """
        return self.plan

    def repair(
        self,
        instructions: str,
        brief: Mapping[str, Any],
        plan: Mapping[str, Any],
        refusal: Refusal,
        *,
        check: Callable[[str], Mapping[str, Any]] | None = None,
    ) -> Mapping[str, Any]:
        """Refuses, because the one thing a handed plan cannot be is repaired.

        Answering with the plan that was just refused would spend the repair budget arriving at
        the same refusal every cycle and end the Run as `budget-exhausted` — which reads, in a
        bundle, as a crew that tried and could not converge rather than as an operator who
        handed it a plan production will not take. The refusal is the honest report of which of
        those actually happened, and it carries what production said.
        """
        named = ", ".join(refusal.codes)
        raise PlanNotRepairable(
            f"A handed plan cannot answer a refusal{f' naming {named}' if named else ''}."
        )


class AdkPlanAuthor(PlanAuthor):
    """The live author: a model, reached through the ADK framework.

    The framework and the model client are imported when one of these is built rather than
    when this module is loaded, which is what lets the crew's tests — and a bare `pytest` —
    run with neither installed. Nothing else in the crew imports them at all.

    Its credential comes from the environment the runtime was given and is never held here,
    read, or written anywhere the crew can reach.

    **The default model is pinned, and a stale pin is a dead run rather than a slow one.**
    Google retires a family to *new* callers while still returning it from `models.list()`:
    on 2026-08-26 both `gemini-2.5-pro` and `gemini-2.5-flash` were listed and answered
    `404 NOT_FOUND · no longer available to new users`. So a liveness check written against
    the catalogue would pass and the first turn would still die. The pin is checked by asking
    the model, never by looking it up. An alias like `gemini-pro-latest` would dodge the
    retirement and is deliberately not used: a Run's bundle has to be able to say which model
    authored the plan, and a floating name cannot.
    """

    reviews_drafts = True

    def __init__(
        self,
        *,
        model: str = "gemini-3.6-flash",
        name: str = "producer",
        app_name: str = "vox-crew",
    ) -> None:
        from google.adk.agents import LlmAgent  # noqa: PLC0415

        self._llm_agent = LlmAgent
        self._model = model
        self._name = name
        self._app_name = app_name

    def agent(self, instructions: str, check: Callable[..., Any] | None = None) -> Any:
        """The agent that would be asked, built but not run.

        Exposed because building it is the furthest a machine with no model credential can
        follow this path, and a seam that can only be exercised with a key is one that is
        never exercised. `check` is bound as the agent's one tool where it was given, which is
        what makes that reachable too: a keyless machine can assert the tool is on the agent.

        The framework takes a plain function and reads its name, signature and docstring to
        build the declaration the model sees, so the tool's docstring is prompt text — which is
        why it is written in the contract's vocabulary and scanned along with the rest.
        """
        return self._llm_agent(
            name=self._name,
            model=self._model,
            description="Authors a VideoPlan for a Brief from the published contract.",
            instruction=instructions,
            tools=[check] if check is not None else [],
        )

    def author(
        self,
        instructions: str,
        brief: Mapping[str, Any],
        *,
        check: Callable[[str], Mapping[str, Any]] | None = None,
    ) -> Mapping[str, Any]:
        return self._ask(instructions, brief, check)

    def repair(
        self,
        instructions: str,
        brief: Mapping[str, Any],
        plan: Mapping[str, Any],
        refusal: Refusal,
        *,
        check: Callable[[str], Mapping[str, Any]] | None = None,
    ) -> Mapping[str, Any]:
        """The same ask, with the refused plan beside the Brief in the message.

        The refusal itself is already in the instructions — `repair_plan` put it there, after
        the catalog, so the prefix a repair is authored against is the prefix the first
        authoring used. Nothing is composed here: the two keys below are the interface's own
        nouns, and the plan is the model's own previous answer handed back unedited.
        """
        return self._ask(instructions, {"brief": brief, "plan": plan}, check)

    def _ask(
        self,
        instructions: str,
        message: Mapping[str, Any],
        check: Callable[[str], Mapping[str, Any]] | None = None,
    ) -> Mapping[str, Any]:
        """One ask, which is one *turn* and not necessarily one model call.

        Only the final response is read. With a tool bound the run yields the intermediate
        turns too — the call the model made and the answer it got back — and joining every
        text part the way this did before tools would splice the model's reasoning about a
        finding into the JSON it eventually answered with, so `_plan_from` would be handed a
        plan with prose in front of it. `is_final_response` is the framework's own answer to
        which event is the reply, so the reply is read by asking rather than by concatenating.
        """
        import asyncio  # noqa: PLC0415

        from google.adk.runners import InMemoryRunner  # noqa: PLC0415
        from google.genai import types  # noqa: PLC0415

        runner = InMemoryRunner(
            agent=self.agent(instructions, check), app_name=self._app_name
        )
        session = asyncio.run(
            runner.session_service.create_session(app_name=self._app_name, user_id=self._name)
        )
        answered = [
            part.text
            for event in runner.run(
                user_id=self._name,
                session_id=session.id,
                new_message=types.Content(
                    role="user", parts=[types.Part(text=message_text(message))]
                ),
            )
            if event.is_final_response() and event.content
            for part in (event.content.parts or ())
            if part.text
        ]
        return _plan_from(("".join(answered)).strip())


def _plan_from(answer: str) -> Mapping[str, Any]:
    """The plan out of a model's answer, whether or not it arrived in a fence."""
    fenced = re.search(r"```(?:json)?\s*(.+?)```", answer, re.DOTALL)
    body = fenced.group(1) if fenced else answer
    try:
        plan = json.loads(body)
    except json.JSONDecodeError as error:
        raise PlanNotAuthored(
            f"An author answered with something that is not JSON: {error}"
        ) from error
    return _as_plan(plan, "answered")
