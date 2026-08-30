"""What one Run sends a model, and the budget it works within.

The crew's prompt is dominated by one thing. The projections addressed to an author assemble
into roughly 95 KB of instructions, the catalog is nearly 60% of that, and every turn of the
repair loop is authored against the whole of it — so a Run answering one Brief puts six times
the catalog in front of a model. `planner.cache_prefix` assembles it once and every turn
reads that same object, which makes those six prefixes byte-identical.

**What that does and does not establish.** `cache_prefix` caches inside this process: one
assembly, held and re-read by every turn. It is not a provider cache and it recovers no cost.
What the identical prefix does buy is **comparability** — a measurement taken either side of a
change is a measurement of the change, because everything in front of it was the same bytes.
That is real, offline, and the property the arrangement earns its place on. Two things are
worth writing down because they are easy to assume the other way:

- Identical prefixes are **transmitted in full, every turn**. Assembling once is not sending
  once. `repeated_prefix_chars` below is named for what it is: the prefix that went down the
  wire again on the turns after the first.
- **A provider cache is not merely unobserved here. It is out of reach.** The crew is not wired
  to ADK's own `ContextCacheConfig`, and wiring it as things stand would be a switch that could
  never fire. ADK's cache begins on the second turn of a session at the earliest — a first
  request has no previous token count to match against, and the cache manager skips creation
  when there is none — while `AdkPlanAuthor` opens a fresh session per ask. Every session this
  crew opens is therefore single-turn, which is the case ADK names outright as never cached.
  Nor is it configurable into reach: `min_tokens` raises that floor and cannot lower it.

Reusing one session across a Run's turns is the change that would put a cache in reach, and it
is rejected. The repair loop rebuilds the whole prompt rather than growing a conversation, which
is what keeps the prefix identical and the measurements comparable in the first place; holding
one session would change what the model sees on every turn after the first. ADR-0017 records
that decision, and `evidence` publishes it beside the field, so that a reader meeting the number
does not take it for a bug someone should clear.

Nothing here claims a cache was served, and nothing here is waiting to be told one was. Whether
a provider does something of its own with a prefix it has seen before is not visible from this
side, and the crew says nothing about it in either direction.

**This module's vocabulary does not belong in `CONTEXT.md`.** It was tried, and the build
refused it correctly: the repository glossary is *generated into the `language` contract*, which
is one of the projections published to an agent. So a "resident prefix" entry there would
teach a model about the crew's own budget accounting — implementation detail reaching a prompt,
which is the thing the leak scan exists to stop — and would grow the very prefix it describes.
The terms are defined here and in `services/agents/README.md`, which agents never read.

This module is the account of that. It is deliberately small and holds no text: an `Ask`
records how large the resident prefix was and how much that turn added on top of it, and a
`ContextSpend` is the asks a Run made. Keeping the prompts themselves would put a second
124 KB copy of the catalog inside every evidence bundle, and the bundle already carries the
instructions the Run's last version was authored against.

**Characters, not tokens.** The exact thing a Python process can measure offline is the length
of the text it is about to send. A token count is a model's arithmetic over that text, and the
only tokenizer that would answer for the authoring model is either a network call or a
sentencepiece model this machine does not have — so a token budget would be a number no test
could check. Characters are checked on every run of the suite; `tokens` converts them for the
one audience that thinks in tokens, at a divisor chosen to over-estimate rather than to be
right on average.

**Three character lines, because they are three different costs.** `resident_chars` is the
catalog: one prefix, the same on every turn, counted once because counting it per turn would
report the repair budget rather than the prompt. `fresh_chars` is the refusals and the plans
handed back, which are new text every turn and are billed at full rate every turn.
`returned_chars` is what a tool handed an author mid-turn, which appears only in the calls
after the one that asked for it. A single total would hide the distinction the whole ticket is
about, and it is the distinction that decides whether a longer repair loop is affordable.

**The resident line is the one everybody watches and the returned line is the one that will
break.** The catalog is the same material either way — the difference is only whether it
reaches a model resident or fetched. The resident path has an allowance, a census and a growth
table behind it; the fetched path had a bundle field and nothing else, and every direction this
crew is heading multiplies what comes back through it. Both are lines now, and `overrun` reads
all four.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# Characters per token, chosen low so the token figure is an upper bound. Minified JSON with
# short camelCase identifiers tokenizes worse than prose does — three is under any ratio this
# prompt has been observed at, which is the direction a budget wants to be wrong in.
CHARS_PER_TOKEN = 3

# What the resident prefix may grow to. The prefix assembles to ~95,500 characters today,
# measured over the recorded projections by `tests/test_context.py`, which fails if it passes
# this line. The headroom is about a third — room for the catalog to gain four more
# capabilities before a Run is refused for it, measured by crew ticket 25 rather than argued —
# and small enough that a projection arriving whole is a failure rather than a shrug.
#
# The line itself did not move for ticket 25, and deliberately: what that ticket bought is
# distance from a fixed line, and raising the line at the same time would have spent the gain
# in the same commit that made it.
RESIDENT_CHARS_ALLOWED = 150_000

# What one turn may add on top of the prefix, averaged over the turns a Run is allowed: a
# refusal and the message beside it. The worst turn `tests/test_context.py` constructs is
# ~15,300 characters — the largest refusal the fixtures record, handed back with a showcase
# Brief and an eight-scene plan. The allowance is per ask but the line is checked against the
# Run's total, so a plan that grows past this on one cycle is paid for out of the cheaper
# authoring turn rather than ending a Run mid-repair.
FRESH_CHARS_PER_ASK = 20_000

# How many tool calls one ask may make, summed from the two sequences that are written down
# rather than chosen here.
#
# Three are the draft-review loop's, and that allowance is unchanged: the smallest that lets an
# author read a finding, repair, and confirm the repair — the loop the tool exists for. Three
# more are the deepest an authoring turn reaches under crew ticket 24, which names the sequence
# outright: an author that searches the catalog, fetches two specifications, reviews a draft and
# answers. Six is therefore a ceiling over both, and both halves can be pointed at.
#
# It is a ceiling rather than a target. The one live Run measured so far used one call, and an
# author holding no tool uses none.
TOOL_CALLS_PER_ASK = 6

# How many model calls one ask may take: the call that reads the prefix, plus one for each tool
# answer the author reads back. Derived rather than stated, so that the count of calls and the
# count of tool answers cannot be moved apart — a rate line and a returned line that disagreed
# about how many answers a turn may fetch would be two budgets for one term.
#
# The line exists because a tool loop is the only term in a Run's spend that the crew does not
# choose. `repair_budget` decides how many plan versions a Run may ask for; how many times an
# author calls a tool inside one of them is the model's decision, and an unbounded term in an
# account that is evidence is a number nobody can promise.
MODEL_CALLS_PER_ASK = 1 + TOOL_CALLS_PER_ASK

# The largest single thing a tool can hand an author: one capability's published specification.
# The eight the catalog publishes run 4,192 to 9,909 characters, mean 6,813, measured over the
# recorded contract by `tests/test_context.py` — which fails if the largest passes this line,
# because the size of another team's contract is a fact to re-measure rather than remember.
LARGEST_PUBLISHED_SPEC_CHARS = 10_000

# What one ask may pull back from its tools, over every call it makes.
#
# Three answers at the ceiling above: the search and the two specifications ticket 24 names as
# the deepest sequence an authoring turn has a reason to make. The draft-review loop's own
# answers sit inside that rather than beside it — measured over the recorded contract they are
# 28 characters for a clean draft and 386 for a malformed one, three orders below a
# specification, and a line that itemised them would be pricing rounding error.
#
# Three rather than eight, and that is the whole of the line. Eight specifications is the
# catalog, and every author already holds the catalog resident — a turn that pulls all of it
# back has re-fetched what it was given for free, which is the loop this line exists to name.
# The catalog is checked against this in `tests/test_context.py`, so the case the line was
# written for is asserted rather than described.
#
# Below `TOOL_CALLS_PER_ASK * LARGEST_PUBLISHED_SPEC_CHARS`, deliberately. A returned line set
# at or above that product could not fire without the rate line firing first, which would make
# it a restatement of a line that already exists rather than a line.
#
# Checked against the one live Run that used a tool: the showcase Run of 2026-08-27 pulled back
# 3,281 characters over three model calls, an order under one ask's allowance. So the line is a
# ceiling over what has actually happened rather than a line drawn under it.
#
# The allowance is per ask and the line is checked against the Run's total, the way
# `FRESH_CHARS_PER_ASK` is and for the same reason: a turn that needed three specifications
# where the last needed none is paid for out of the cheaper turn rather than ending a Run
# mid-repair.
#
# That it lands on the same figure as the fresh line is arithmetic, not a tie. The two are
# derived from different measurements — the largest refusal production publishes, and the
# largest specification the catalog does — and each moves when its own does.
#
# One asymmetry with the fresh line, and it cannot be closed. Every term of a repair is known
# before it is asked for, so the fresh line refuses the turn that would cross it. What a tool
# will hand back is not knowable until the author has called it — `planner.authoring_ask` says
# the same thing about the rate line for the same reason — so this line is read against a turn
# that has already happened, and the turn it refuses is the next one.
RETURNED_CHARS_PER_ASK = 3 * LARGEST_PUBLISHED_SPEC_CHARS

# The lines a Run can pass, named the way `converge` names its budget lines and for the same
# reason: `limit` is read by whoever audits the Run, and a string literal at a return site is
# a reason nothing else in the repo can recognise.
RESIDENT_CHARS = "resident_chars"
FRESH_CHARS = "fresh_chars"
MODEL_CALLS = "model_calls"
RETURNED_CHARS = "returned_chars"


class ContextBudgetExceeded(RuntimeError):
    """The resident prefix does not fit the budget, so nothing was asked.

    Raised rather than reported as a Run outcome, and only for the resident line. A prefix too
    large for the budget is a fact about the crew's own prompt — true of every turn, before any
    Run exists to spend discovering it — which is the same species as a prompt that leaks, and
    it is refused in the same place and the same way. What a turn adds *on top of* a prefix
    that fits is the Run's own spending, and that ends a Run rather than raising.
    """


def tokens(chars: int) -> int:
    """The character count as a token count, rounded up at a deliberately low divisor.

    Rounded up rather than to nearest, because every use of this is a budget figure and a
    budget that rounded down would under-report the turn it was about to allow.
    """
    return math.ceil(chars / CHARS_PER_TOKEN)


@dataclass(frozen=True, slots=True)
class Ask:
    """One thing the crew put in front of an author, in the costs it has.

    `resident` is the instructions prefix the turn was authored against — the same object every
    turn, which is what makes every turn's prompt comparable. `fresh` is everything else that
    reached the model:
    the refusal, where there was one, and the message carrying the Brief and the plan being
    repaired.

    **`model_calls` is why an ask is not a model call.** An author holding a tool answers over
    several model calls rather than one: it reads the prefix, calls the tool, and reads the
    prefix again with the tool's answer appended. An `Ask` that assumed one call would report a
    fraction of what a tool-using turn actually put in front of a model, and a bundle is
    evidence — so the count is carried rather than assumed. A turn that used no tool has
    `model_calls=1` and prices exactly as it always did.

    `returned` is what the tool handed back, and it is a field of its own rather than more
    `fresh` for a reason the first version of this got wrong: **`resident` and `fresh` are both
    re-sent on every call, and a tool's answer is not.** The prefix and the message carrying the
    Brief sit in the conversation for the whole ask, so both multiply; an answer appears only in
    the calls after the one that asked for it. Folding the answers into `fresh` charged them
    once and charged the Brief once, which under-reported the larger of the two and misreported
    both.

    What `chars` does *not* do is charge each answer for every later call that carries it. That
    would need each answer's size and the meter keeps only their total, so this is a floor on
    the tool's tail rather than the exact figure — named here because a number in a bundle that
    quietly rounds in its own favour is worse than one that says where it stops.
    """

    resident: int
    fresh: int
    model_calls: int = 1
    returned: int = 0

    @property
    def chars(self) -> int:
        """What this turn put in front of a model, over every model call it made."""
        return (self.resident + self.fresh) * self.model_calls + self.returned


@dataclass(frozen=True, slots=True)
class ContextBudget:
    """What one Run may send a model, in the units the crew can measure without one."""

    resident_chars: int
    fresh_chars: int
    model_calls: int
    returned_chars: int


def context_budget(asks: int) -> ContextBudget:
    """The budget for a Run allowed `asks` plan versions.

    Keyed on the same number `repair_budget` already derives from the Brief's length rather
    than on the Brief again: the catalog is charged once whatever the Brief asks for — charged
    once against this budget, not sent once, since it is transmitted on every turn — and the
    only thing a longer Brief buys is more turns to send fresh text in. Two budgets reading the
    Brief separately would be two rules to keep in step.
    """
    return ContextBudget(
        resident_chars=RESIDENT_CHARS_ALLOWED,
        fresh_chars=FRESH_CHARS_PER_ASK * asks,
        model_calls=MODEL_CALLS_PER_ASK * asks,
        returned_chars=RETURNED_CHARS_PER_ASK * asks,
    )


@dataclass(frozen=True, slots=True)
class ContextSpend:
    """Every ask a Run made, and what they cost with the prefix resident and without it."""

    asks: tuple[Ask, ...]

    @property
    def asks_made(self) -> int:
        """How many plan versions were asked for. One per authoring or repair turn."""
        return len(self.asks)

    @property
    def model_calls(self) -> int:
        """How many times a model was actually called. The Run's whole rate consumption.

        Separate from `asks_made` because an author holding a tool answers one ask over
        several calls. The two are equal for an author that holds none, which is every
        scripted Run and was every Run before a tool was bound.
        """
        return sum(ask.model_calls for ask in self.asks)

    @property
    def one_prefix(self) -> bool:
        """Whether every turn read a prefix of one size — the comparability property itself.

        Deliberately not called `cached`. In a Run driven by `converge` this is true by
        construction, because every `Ask` is priced against the same `CachedPrefix`, so as
        *evidence* it is a probe that cannot fail and the bundle must not present it as one. It
        is kept because it is a real invariant with a real way of breaking: a future caller that
        authored some turns against one prefix and some against another would show up here, and
        the field is what a reader checks before believing `repeated_prefix_chars`.

        Lengths rather than bytes: this is an account, not a second copy of the prompt. That the
        prefix is the same *object* across a convergence is asserted where it is built, by
        counting how many times a whole Run assembles one.
        """
        return len({ask.resident for ask in self.asks}) <= 1

    @property
    def resident_chars(self) -> int:
        """The prefix, charged once. The largest, where a Run somehow read more than one."""
        return max((ask.resident for ask in self.asks), default=0)

    @property
    def fresh_chars(self) -> int:
        """The message beside the prefix, charged once per call that carried it."""
        return sum(ask.fresh * ask.model_calls for ask in self.asks)

    @property
    def returned_chars(self) -> int:
        """What an author's tools handed back across the Run. Zero for an author holding none.

        Charged once rather than per call, because an answer appears only in the calls after
        the one that asked for it — see `Ask.chars`, which says where that floor stops being
        exact. `RETURNED_CHARS_PER_ASK` is the line it is read against.
        """
        return sum(ask.returned for ask in self.asks)

    @property
    def sent_chars(self) -> int:
        """The counterfactual: what the Run would have cost had the prefix been charged once.

        Not what it did cost. Every turn transmits the whole prefix, so this prices a Run that
        did not happen. It is kept because `repeated_prefix_chars` is the distance between it
        and `distinct_chars`, and that distance is the figure that does describe this Run.
        """
        return self.resident_chars + self.fresh_chars + self.returned_chars

    @property
    def distinct_chars(self) -> int:
        """Every turn's prompt in full: what a Run costs with nothing reused."""
        return sum(ask.chars for ask in self.asks)

    @property
    def repeated_prefix_chars(self) -> int:
        """The identical prefix, re-sent. What the turns after the first spent repeating it.

        Not an eligibility and not a saving. Every turn transmits the whole prefix, so this is
        text that certainly reached a model, counted apart because it is the term that grows
        with the repair budget while saying nothing about the Brief. A provider cache is what
        would make it cheaper, and this crew's session model does not reach one — see this
        module's opening note.
        """
        return self.distinct_chars - self.sent_chars

    def as_sentence(self) -> str:
        """What this Run cost, in one line, for whoever is reading rather than parsing.

        Here rather than at each reader, because the command's stderr and the bundle's summary
        report the same three numbers and were reporting them in two near-identical format
        strings — which is one reworded phrase away from a Run whose two accounts of itself
        read differently.
        """
        asks = f"{self.asks_made} model ask{'' if self.asks_made == 1 else 's'}"
        if self.model_calls != self.asks_made:
            asks += f" over {self.model_calls} model calls"
        return (
            f"{asks}, {self.distinct_chars:,} characters "
            f"(~{tokens(self.distinct_chars):,} tokens) put in front of a model, of which "
            f"{self.repeated_prefix_chars:,} is the teaching surface re-sent unchanged on the "
            "turns after the first"
        )

    def overrun(self, budget: ContextBudget) -> str | None:
        """Which line this spend has passed, or None.

        The resident line is read first. A prefix that does not fit is a fact about the crew's
        own prompt and is true of every turn; what one turn added on top of it is noise beside
        that, and reporting the turn line would send whoever reads it to the wrong place.

        The rate line is read next, ahead of the character line it would also blow. A Run that
        passed it spent its budget on an author looping against a tool rather than on plan
        versions, and that is the finding — where the characters went is a symptom of it. It is
        read here rather than reported because a term the crew does not choose is exactly the
        term that has to be bounded: `model_calls` was published beside `asks_made` and enforced
        by nothing, which left the Run budget carrying a number nobody could promise.

        The returned line is read with the rate line rather than with the character lines,
        because it is the other half of the same unchosen term: the rate line bounds how many
        answers an author fetches and this one bounds how large they are. A Run can stay inside
        its calls and still pull back more than the catalog it was already holding, and where
        both were passed the loop is the finding for the same reason it is above.

        The turn line is read last, unchanged. What a turn added on top of a prefix that fits,
        without looping and without fetching, is the one term of the four the crew does choose.
        """
        if self.resident_chars > budget.resident_chars:
            return RESIDENT_CHARS
        if self.model_calls > budget.model_calls:
            return MODEL_CALLS
        if self.returned_chars > budget.returned_chars:
            return RETURNED_CHARS
        if self.fresh_chars > budget.fresh_chars:
            return FRESH_CHARS
        return None
