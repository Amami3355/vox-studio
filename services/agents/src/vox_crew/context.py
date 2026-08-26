"""What one Run sends a model, and the budget it works within.

The crew's prompt is dominated by one thing. The five projections assemble into roughly 125 KB
of instructions, the catalog is half of that, and every turn of the repair loop is authored
against the whole of it — so a Run that re-sent the teaching surface per turn would spend six
times the catalog to answer one Brief. It does not: `planner.cache_prefix` assembles the
instructions once and every turn reads that same object, which is what lets a provider serve
the prefix from its cache rather than reading it again.

This module is the account of that. It is deliberately small and holds no text: an `Ask`
records how large the resident prefix was and how much that turn added on top of it, and a
`ContextSpend` is the asks a Run made. Keeping the prompts themselves would put a second
124 KB copy of the catalog inside every evidence bundle, and the bundle already carries the
instructions the Run's last version was authored against.

**Characters, not tokens.** The exact thing a Python process can measure offline is the length
of the text it is about to send. A token count is a model's arithmetic over that text, and the
only tokenizer that would answer for `gemini-2.5-pro` is either a network call or a
sentencepiece model this machine does not have — so a token budget would be a number no test
could check. Characters are checked on every run of the suite; `tokens` converts them for the
one audience that thinks in tokens, at a divisor chosen to over-estimate rather than to be
right on average.

**Two lines, because they are two different costs.** `resident_chars` is the catalog, sent
once and served from a cache after that. `fresh_chars` is the refusals and the plans handed
back, which are new text every turn and are billed at full rate every turn. A single total
would hide the distinction the whole ticket is about, and it is the distinction that decides
whether a longer repair loop is affordable.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# Characters per token, chosen low so the token figure is an upper bound. Minified JSON with
# short camelCase identifiers tokenizes worse than prose does — three is under any ratio this
# prompt has been observed at, which is the direction a budget wants to be wrong in.
CHARS_PER_TOKEN = 3

# What the resident prefix may grow to. The teaching surface assembles to ~125,000 characters
# today, measured over the recorded projections by `tests/test_context.py`, which fails if it
# passes this line. The headroom is about a fifth, which is room for the catalog to gain
# capabilities without a Run being refused for it — and small enough that a projection arriving
# whole is a failure rather than a shrug.
RESIDENT_CHARS_ALLOWED = 150_000

# What one turn may add on top of the prefix, averaged over the turns a Run is allowed: a
# refusal and the message beside it. The worst turn `tests/test_context.py` constructs is
# ~15,300 characters — the largest refusal the fixtures record, handed back with a showcase
# Brief and an eight-scene plan. The allowance is per ask but the line is checked against the
# Run's total, so a plan that grows past this on one cycle is paid for out of the cheaper
# authoring turn rather than ending a Run mid-repair.
FRESH_CHARS_PER_ASK = 20_000

# The lines a Run can pass, named the way `converge` names its budget lines and for the same
# reason: `limit` is read by whoever audits the Run, and a string literal at a return site is
# a reason nothing else in the repo can recognise.
RESIDENT_CHARS = "resident_chars"
FRESH_CHARS = "fresh_chars"


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
    """One thing the crew put in front of an author, in the two costs it has.

    `resident` is the instructions prefix the turn was authored against — the same object every
    turn, which is what makes it cacheable. `fresh` is everything else that reached the model:
    the refusal, where there was one, and the message carrying the Brief and the plan being
    repaired.
    """

    resident: int
    fresh: int

    @property
    def chars(self) -> int:
        """What this turn would cost with nothing cached."""
        return self.resident + self.fresh


@dataclass(frozen=True, slots=True)
class ContextBudget:
    """What one Run may send a model, in the units the crew can measure without one."""

    resident_chars: int
    fresh_chars: int


def context_budget(asks: int) -> ContextBudget:
    """The budget for a Run allowed `asks` plan versions.

    Keyed on the same number `repair_budget` already derives from the Brief's length rather
    than on the Brief again: the catalog is sent once whatever the Brief asks for, and the only
    thing a longer Brief buys is more turns to send fresh text in. Two budgets reading the
    Brief separately would be two rules to keep in step.
    """
    return ContextBudget(
        resident_chars=RESIDENT_CHARS_ALLOWED,
        fresh_chars=FRESH_CHARS_PER_ASK * asks,
    )


@dataclass(frozen=True, slots=True)
class ContextSpend:
    """Every ask a Run made, and what they cost with the prefix resident and without it."""

    asks: tuple[Ask, ...]

    @property
    def asks_made(self) -> int:
        """How many times a model was asked. The Run's whole rate consumption."""
        return len(self.asks)

    @property
    def cached(self) -> bool:
        """Whether every turn read one prefix, which is the first criterion's instrument.

        Lengths rather than bytes: this is an account, not a second copy of the prompt. That a
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
        return sum(ask.fresh for ask in self.asks)

    @property
    def sent_chars(self) -> int:
        """What the Run cost with the prefix served from a cache after the first turn."""
        return self.resident_chars + self.fresh_chars

    @property
    def uncached_chars(self) -> int:
        """What the same Run would have cost re-sending the teaching surface every turn."""
        return sum(ask.chars for ask in self.asks)

    @property
    def saved_chars(self) -> int:
        return self.uncached_chars - self.sent_chars

    def overrun(self, budget: ContextBudget) -> str | None:
        """Which line this spend has passed, or None.

        The resident line is read first. A prefix that does not fit is a fact about the crew's
        own prompt and is true of every turn; what one turn added on top of it is noise beside
        that, and reporting the turn line would send whoever reads it to the wrong place.
        """
        if self.resident_chars > budget.resident_chars:
            return RESIDENT_CHARS
        if self.fresh_chars > budget.fresh_chars:
            return FRESH_CHARS
        return None
