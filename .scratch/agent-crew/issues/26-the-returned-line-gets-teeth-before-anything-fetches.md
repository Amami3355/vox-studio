# 26: The returned line gets teeth before anything starts fetching

Status: ready-for-agent

## Problem Statement

`ContextSpend.returned_chars` is computed at `context.py:248`, published to the evidence bundle
as `returnedChars` at `evidence.py:448`, asserted by a bundle test at `test_evidence.py:733`, and
**read by no budget line anywhere.** `overrun` at `context.py:297` checks three things:
`resident_chars`, `model_calls`, `fresh_chars`. What a tool hands back is metered, reported, and
allowed without limit.

That has cost nothing so far, and the reason it has cost nothing is about to stop being true. One
tool exists, it returns findings, and the only live Run on record used a single call. The number
has always been small enough that nobody noticed it was unbounded.

Every direction this project is now heading multiplies it. Ticket 24 binds catalog-search and
scene-spec tools to the author. Tickets 27 and 28 give roles a surface they must fetch rather than
read. A capability spec is **6,813 characters on average** — range roughly 4,200 for
`stat_counter` to 9,900 for `line_chart` — so an author that fetches eight of them pulls back
about **54,500 characters** that no line in `context.py` will refuse, on a Run whose resident
budget is enforced to the character.

`MODEL_CALLS_PER_ASK = 4` has the same shape of problem from the other end. Its own comment is
honest about it: the constant was chosen rather than measured, on the reasoning that three calls
is *"the smallest allowance that lets an author read a finding, repair, and confirm the repair."*
Ticket 24 states outright that it must move — *"an author that searches, fetches two specs,
reviews a draft and answers needs more than four."* If it moves while `returned_chars` has no
line, the crew has traded one bounded term for an unbounded one and the account stops being
evidence.

`context.py` says why this matters in its own words, about the rate line, and the argument
transfers exactly: *"a tool loop is the only term in a Run's spend that the crew does not choose
… an unbounded term in an account that is evidence is a number nobody can promise."*

**A second, smaller thing is unresolved and belongs here.** Ticket 24's criterion says the bundle
must distinguish *asked nothing* from *could not ask*. `planner._offered` at `planner.py:972`
deliberately does the opposite: it builds a meter for every author, tool-holding or not, so that
*"an author that cannot call the tool leaves the meter reading zero, which is the same answer an
author that could and did not leaves — so no caller has to ask which kind it is holding."* Both
are defensible. They cannot both be true, and the place to settle it is where the meter is being
given a budget rather than in whichever ticket happens to land first.

## Solution

Give the returned line the same treatment the rate line already has: a constant with reasoning,
a check in `overrun`, and a named limit a bundle reader can recognise.

`RETURNED_CHARS_PER_ASK` joins `FRESH_CHARS_PER_ASK` and `MODEL_CALLS_PER_ASK`, `context_budget`
carries it, `overrun` reads it, and `RETURNED_CHARS` joins the string constants that exist so
that *"`limit` is read by whoever audits the Run, and a string literal at a return site is a
reason nothing else in the repo can recognise."*

Where the line is read matters as much as that it exists. `overrun`'s current order encodes an
argument — resident first because a prefix that does not fit is true of every turn before any Run
exists; rate next because a Run that spent its budget looping against a tool *is* the finding and
the characters are a symptom. The returned line sits with the rate line, for the same reason: it
is the other half of the same unchosen term.

And `MODEL_CALLS_PER_ASK` moves here rather than inside ticket 24, so that the constant and the
line that backs it move together. What it moves to is a decision this ticket makes and writes
down; four was a guess and its replacement must not be.

## Implementation Decisions

- **The constant is derived from something, and the derivation is in the comment.** Four was
  chosen and its comment admits it. A replacement that is also a guess leaves the account exactly
  where it is. The measured inputs exist: mean 6,813 characters per capability spec, eight
  capabilities today, and ticket 23's census for what the resident material actually costs.
- **The line is per ask and checked against the Run total**, the way `FRESH_CHARS_PER_ASK`
  already is — *"so a plan that grows past this on one cycle is paid for out of the cheaper
  authoring turn rather than ending a Run mid-repair."* The same reasoning applies unchanged to a
  turn that needed three specs when the previous turn needed none.
- **Overrunning the returned line ends the Run; it does not raise.** `ContextBudgetExceeded` is
  reserved for the resident line, on the recorded ground that a prefix too large is a fact about
  the crew's own prompt, true before any Run exists. What a tool handed back is the Run's own
  spending, and `context.py` is explicit that such a thing *"ends a Run rather than raising."*
- **`Ask.chars` is not changed and its floor stays a floor.** Its docstring already records that
  it does not charge each answer for every later call carrying it, *"named here because a number
  in a bundle that quietly rounds in its own favour is worse than one that says where it stops."*
  Adding a budget line does not make the meter more precise and must not be described as if it
  had.
- **`_offered` versus the bundle's distinction is settled explicitly, in a docstring, either
  way.** If the meter keeps its single shape, ticket 24's criterion is amended to match and the
  bundle carries the fact from the author rather than from the meter. If the bundle needs the
  distinction, `_offered` gains it and its four callers absorb the second shape. What is not
  acceptable is two tickets landing with opposite assumptions and a reader discovering it in the
  bundle.
- **This lands before ticket 24, 27 or 28.** Not a preference. A budget added after the spending
  starts is a budget fitted to what happened, which is the one thing an account that is evidence
  cannot be.

## Testing Decisions

**The line refuses.** A constructed spend whose returned characters pass the line reports
`RETURNED_CHARS` from `overrun`, and one just under it reports `None`. Direct, over
`ContextSpend`, no model.

**The order is asserted.** A spend that passes both the rate line and the returned line reports
the rate line, and a spend that passes the resident line reports that ahead of both. The existing
tests already pin the first two of these; the third is the new one.

**A Run that overruns it ends rather than raises.** Through `converge`, with a scripted author and
a stub tool that returns more than the line allows: the Run terminates with the limit named, and
no exception escapes.

**The bundle reports the limit by its name.** `returnedChars` is already published; the overrun
reason must be readable beside it, and a reader must be able to tell which line a Run stopped on
without inferring it from the numbers.

**A tool-free Run is unchanged.** Every scripted Run's spend, budget and bundle are what they
were. This is the assertion that keeps the change from being visible anywhere it should not be.

**The `_offered` decision is asserted whichever way it goes.** If both cases stay a meter at
zero, a test says so and names the two authors. If they diverge, a test distinguishes them.

## Out of Scope

- **Binding any new tool.** Ticket 24. This ticket bounds what tools may hand back; it adds none.
- **Changing `Ask.chars` or how a tool's answer is priced.** The floor stays where it is, for the
  reason its docstring records.
- **Changing `CHARS_PER_TOKEN` or moving to tokens.** `context.py` records why characters, and
  nothing here reopens it.
- **The resident line.** 150,000 is a transmission-cost choice and moving it is a different
  argument with different evidence. Ticket 25 buys headroom under it; this ticket does not touch
  it.

## Further Notes

**The resident line is the one everybody watches and the returned line is the one that will
actually break.** `resident_chars` is checked on every run of the suite and has an ADR, a census
and a growth table behind it. `returned_chars` has a bundle field. The catalog is the same
material either way — the difference is only whether it reaches a model resident or fetched, and
the fetched path is the one with no line.

**Blocked by:** None (can start immediately; should land before 24, 27 and 28)

- [ ] `returned_chars` is read by a budget line and an overrun names it
- [ ] The limit is a named constant with its derivation written down, not a chosen number
- [ ] The line is per ask and checked against the Run's total, like the fresh line
- [ ] Overrunning it ends the Run and does not raise, and a test asserts which
- [ ] `overrun` reads resident, then rate, then returned, then fresh, asserted in that order
- [ ] `MODEL_CALLS_PER_ASK` moves with a derivation rather than a replacement guess
- [ ] The bundle names which line a Run stopped on, readable beside `returnedChars`
- [ ] A tool-free Run's spend, budget and bundle are unchanged, asserted
- [ ] Whether the meter distinguishes *asked nothing* from *could not ask* is settled in a docstring, and ticket 24's criterion is amended to match
