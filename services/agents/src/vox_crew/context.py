"""What one Run sends a model, and the budget it works within.

The crew's prompt is dominated by one thing. The five projections assemble into roughly 125 KB
of instructions, the catalog is half of that, and every turn of the repair loop is authored
against the whole of it — so a Run answering one Brief puts six times the catalog in front of
a model. `planner.cache_prefix` assembles it once and every turn reads that same object, which
makes those six prefixes byte-identical.

**What that does and does not establish.** An identical prefix, placed first, is the
*precondition* for a provider serving it from a cache instead of reading it again. It is not
the same as having observed one do so, and the crew must not report it as though it were.
Two things are worth writing down because they are easy to assume the other way:

- Identical prefixes are still **transmitted** every turn. What a cache saves is the model's
  work and the bill, not the bytes on the wire. `cacheable_chars` below is named for what it
  is: the spend an identical prefix makes *eligible* for reuse.
- The crew is not wired to ADK's own `ContextCacheConfig`, and wiring it as things stand would
  be a switch that could never fire. ADK's cache "begins on the second turn of a session at
  the earliest", and `AdkPlanAuthor` opens a fresh session per ask — deliberately, because the
  repair loop rebuilds the whole prompt rather than growing a conversation, which is what keeps
  the prefix identical in the first place. So what the arrangement can reach is Gemini's
  *implicit* prefix caching, which is a provider default and not something this code turns on.
  Making the crew hold one session across a Run would change what the model sees on every turn
  after the first; it is a design decision of its own and not this module's to take.

Nothing here claims a cache was served. `assemble` writes an explicit non-claim saying so, and
the first live Run is where it becomes answerable.

**This module's vocabulary does not belong in `CONTEXT.md`.** It was tried, and the build
refused it correctly: the repository glossary is *generated into the `language` contract*, which
is one of the five projections published to an agent. So a "resident prefix" entry there would
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
    def one_prefix(self) -> bool:
        """Whether every turn read a prefix of one size — the cache precondition, not the cache.

        Deliberately not called `cached`. In a Run driven by `converge` this is true by
        construction, because every `Ask` is priced against the same `CachedPrefix`, so as
        *evidence* it is a probe that cannot fail and the bundle must not present it as one. It
        is kept because it is a real invariant with a real way of breaking: a future caller that
        authored some turns against one prefix and some against another would show up here, and
        the field is what a reader checks before believing `cacheable_chars`.

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
        return sum(ask.fresh for ask in self.asks)

    @property
    def sent_chars(self) -> int:
        """What the Run would cost with the prefix charged once, which is the point of caching."""
        return self.resident_chars + self.fresh_chars

    @property
    def distinct_chars(self) -> int:
        """Every turn's prompt in full: what a Run costs with nothing reused."""
        return sum(ask.chars for ask in self.asks)

    @property
    def cacheable_chars(self) -> int:
        """The spend an identical prefix makes eligible for reuse, not a saving observed.

        Every turn after the first re-sends the same prefix, so this is what a provider serving
        it from cache would not have to read again. Whether one did is the provider's answer and
        the crew has never had it — see this module's opening note.
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
        return (
            f"{asks}, {self.distinct_chars:,} characters "
            f"(~{tokens(self.distinct_chars):,} tokens) put in front of a model, of which "
            f"{self.cacheable_chars:,} is the teaching surface re-sent unchanged and eligible "
            "for a provider cache the crew does not measure"
        )

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
