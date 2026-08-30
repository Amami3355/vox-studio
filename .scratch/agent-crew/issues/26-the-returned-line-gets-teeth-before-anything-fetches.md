# 26: The returned line gets teeth before anything starts fetching

Status: done

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

- [x] `returned_chars` is read by a budget line and an overrun names it
- [x] The limit is a named constant with its derivation written down, not a chosen number
- [x] The line is per ask and checked against the Run's total, like the fresh line
- [x] Overrunning it ends the Run and does not raise, and a test asserts which
- [x] `overrun` reads resident, then rate, then returned, then fresh, asserted in that order
- [ ] `MODEL_CALLS_PER_ASK` moves with a derivation rather than a replacement guess — **moved, derivation written down, but its two inputs are argued rather than measured; see the review response**
- [x] The bundle names which line a Run stopped on, readable beside `returnedChars`
- [ ] A tool-free Run's spend, budget and bundle are unchanged, asserted — **spend is asserted; the budget block changed and cannot be unchanged while criterion 6 stands; see the review response**
- [x] Whether the meter distinguishes *asked nothing* from *could not ask* is settled in a docstring, and ticket 24's criterion is amended to match

---

## Comments

### 2026-08-30 — implemented

The returned line is enforced. `RETURNED_CHARS_PER_ASK` is 30,000, `overrun` reads
resident → rate → returned → fresh, `context_budget` carries the fourth line, and the bundle
publishes the allowance beside the figure it bounds.

**The derivation, and why it is one.** Three constants now come out of two measurements and two
written-down sequences, with nothing chosen in between:

- `LARGEST_PUBLISHED_SPEC_CHARS = 10_000` — the ceiling over one capability's published
  specification. The catalog's eight run 4,192 (`stat_counter`) to 9,909 (`line_chart`), mean
  6,813, measured over the recorded contract. `test_the_largest_specification_the_catalog_
  publishes_fits_the_answer_ceiling` fails if the largest passes it, so the ceiling is a
  measurement rather than a memory — the same guard shape `RESIDENT_CHARS_ALLOWED` has.
- `TOOL_CALLS_PER_ASK = 6` — the draft-review loop's three, unchanged and already argued in
  `context.py`, plus the three ticket 24 names in its own sentence: a search, and two
  specifications. Both halves can be pointed at.
- `MODEL_CALLS_PER_ASK = 1 + TOOL_CALLS_PER_ASK` = **7**, up from 4. Derived rather than
  restated, so a future change to the sequence moves the rate line and the returned line
  together instead of letting them disagree about how many answers a turn may fetch.
- `RETURNED_CHARS_PER_ASK = 3 * LARGEST_PUBLISHED_SPEC_CHARS` = **30,000**. Three answers at the
  ceiling: the search and the two specifications. The review loop's own answers are inside that
  rather than beside it — measured, they are 28 characters for a clean draft and 386 for a
  malformed one, three orders below a specification.

**Three rather than eight is the whole of the line, and it is asserted rather than described.**
Eight specifications is the catalog — 54,504 characters over the recorded fixtures — and every
author already holds the catalog resident. `test_an_author_that_fetches_the_whole_catalog_has_
passed_the_returned_line` prices that against the constant, so the case the line was written for
goes red if the line stops refusing it. That test also asserts
`TOOL_CALLS_PER_ASK * LARGEST_PUBLISHED_SPEC_CHARS > RETURNED_CHARS_PER_ASK`, which is the
property that keeps the returned line from being a restatement of the rate line: set at or above
that product it could never fire first, and would be a second way of saying "too many calls".

**Sanity, against something that happened.** The showcase Run of 2026-08-27 — the one live Run
on record that used a tool — pulled back 3,281 characters over three model calls. An order under
one ask's allowance, so the line is a ceiling over what has actually happened rather than a line
drawn under it. Cited in `context.py` beside the constant.

**The `_offered` question is settled: the meter keeps its single shape.** Both "asked nothing"
and "could not ask" leave it reading zero, and the bundle will carry the distinction from the
author's own `reviews_drafts` answer, which `cache_prefix` already reads to decide what the
prompt says. A meter answers what a turn *spent* and both of those turns spent nothing; the
difference is a fact about the author. Teaching the meter a second question would have put one
fact in two places and made the derived one the place they disagree. Argued in `_offered`'s
docstring; ticket 24's criterion amended, with an amendment section naming what it now has to
carry and where.

### Not taken, and why

- **The line is detected after the fact, and that is not fixable.** Every term of a repair is
  known before it is asked for, so the fresh line refuses the turn that would cross it. What a
  tool will hand back is not knowable until the author has called it, so the returned line is
  read against a turn that has already happened and the turn it refuses is the *next* one. The
  rate line has had exactly this shape since it landed. Named in `context.py` rather than
  papered over.
- **A Run that overruns on its last turn and then renders is not refused.** The only gates are
  in `repaired_against`, so a turn that looped or fetched heavily and then produced a plan that
  validates ends `rendered`, with the bundle reporting a non-null `overrun`. This is
  pre-existing and identical for the rate line; closing it means gating after every turn rather
  than before every repair, which changes the rate line's behaviour too and is out of this
  ticket's scope. Worth a ticket of its own.
- **`Ask.chars` is untouched and its floor is still a floor.** It does not charge each answer
  for every later call carrying it. Adding a budget line does not make the meter more precise
  and this change does not describe it as if it had — the ticket said so and it is still true.
- **The `modelCalls` allowance a tool-free Run's bundle reports has moved**, from 24 to 42 for a
  six-ask Run, because the constant moved. The Run's *spend* is unchanged and asserted so; the
  budget block is not, and cannot be while criterion 6 stands. Naming it because "a tool-free
  Run's bundle is unchanged" would otherwise read as a stronger claim than what was checked.
- **No Python linter ran**, because the repo has none installed and configures none. The
  100-character convention was held by hand and checked with `awk`; the one over-long line in
  the files touched here is pre-existing in `test_evidence.py`.

### Measured

Crew pytest **337 passed, 1 skipped** (from 330 passed, 1 skipped). Seven new tests, one
existing ordering test replaced by a stronger one that walks the whole order rather than
asserting a pair.

### 2026-08-30 — two-axis review, and the response to it

Both axes ran over the working tree. Standards found one hard breach and one real duplication;
Spec found something better than a tautology this time, and it was right.

#### The finding that mattered: the line does not refuse what this ticket said it refuses

The Problem Statement is about **one turn** fetching eight specifications. The line was sized
per ask — and then, per this ticket's own third criterion, checked against the **Run's total**.
`repair_budget` never issues fewer than five plan versions, so the smallest returned budget any
Brief gets is 150,000 against a catalog of 54,504. **One turn fetching the whole catalog passes
cleanly, and always would have.**

The test written to evidence it priced the catalog against the bare constant, never against a
budget a Run is issued, so it was green while the case was unrefused — and the ticket 24
amendment then recorded the false claim in writing for whoever picks 24 up. That is the same
defect class as the last two sessions in a new costume: not a comparison built from one side's
own output, but **an assertion against a constant that no Run ever meets**.

Neither the shape nor the constant is wrong; the claim was. The shape is what criterion 3
mandated, and the fresh line has it for a stated reason — an expensive turn is paid for out of
the cheap ones. What the returned line refuses is a *habit*: three whole-catalog turns fit a
six-ask Run and the fourth ends it.

- `test_an_author_that_fetches_the_whole_catalog_has_passed_the_returned_line` is **replaced** by
  `test_one_turn_may_fetch_the_whole_catalog_and_a_run_that_keeps_doing_it_may_not`, which prices
  the catalog against `context_budget(repair_budget(...).plan_versions)` and asserts the real
  boundary — one turn affordable, `budget // catalog` turns affordable, one more refused.
- The deleted assertion `TOOL_CALLS_PER_ASK * LARGEST_PUBLISHED_SPEC_CHARS > RETURNED_CHARS_PER_ASK`
  was correctly called out as arithmetic over constants — it reduces to `6 > 3` and cannot go red
  for any change to production logic. Replaced by a behavioural one: the refused spend stays
  inside the calls it was budgeted, which is what shows the returned line is not a restatement of
  the rate line.
- Ticket 24's amendment is rewritten to say what is true, flagged as a corrected first draft.

#### The measurements cited in the derivation were wrong

`context.py` said the specifications run 4,247 to 9,959, mean 6,866, total 54,929. The test
measures through `planner.message_text`, which serialises with `ensure_ascii=False` the way the
crew actually sends. The real figures are **4,192 to 9,909, mean 6,813, total 54,504**. The
quoted numbers came from a throwaway script using `json.dumps` defaults — `ensure_ascii=True`, a
serialisation production does not use. The ticket's own Problem Statement had 6,813 and was
right; the implementation "corrected" it to a wrong number.

Corrected in `context.py`, `services/agents/README.md`, this ticket and ticket 24. The constant
does not move: 10,000 is still a round-up over the largest, and the guard test still measures.

#### Two ticks withdrawn

- **Criterion 6** (`MODEL_CALLS_PER_ASK` moves with a derivation rather than a guess) —
  **unticked.** It moved 4 → 7 and the derivation is written down, which is the criterion's
  literal wording. But both inputs are *argued*, not measured: the draft-review loop's three is
  the same three the ticket called a guess, and ticket 24's three is restated from that ticket's
  prose. Nothing measures either, and nothing can until the tools exist. The ticket's own
  Implementation Decision — "a replacement that is also a guess leaves the account exactly where
  it is" — is not met, and ticking it would be exactly the overclaim this ticket exists to stop.
  What *is* better than before: the constant is derived from a named sequence rather than stated,
  so a change to the sequence moves the rate line and the returned line together.
- **Criterion 8** (a tool-free Run's spend, budget and bundle are unchanged, asserted) —
  **unticked.** The spend is asserted and is genuinely unchanged. The budget block is not: it
  gained `returnedChars` and its `modelCalls` moved 24 → 42 for a six-ask Run. That cannot be
  otherwise while criterion 6 stands, so the criterion as written is unsatisfiable and the honest
  answer is to say so rather than to tick the half that passed. The bundle's budget assertion is
  also self-referential — it compares the block to the object it was built from — so it pins the
  wiring and could not detect a wrong value either way.

#### Also taken

- **`services/agents/README.md` was not updated in the same change**, which `context.py`'s own
  docstring makes a documented requirement ("the terms are defined here and in
  `services/agents/README.md`"). The README still described an `Ask` as "two numbers". Now
  carries the four lines, the order `overrun` reads them in, the derivation, and the asymmetry.
- **`a_budget`/`UNLIMITED` promoted to `conftest.py`**, and `a_run_that_consults_its_tool` and
  `RETURNS_MORE_THAN_ALLOWED` to `test_converge.py`. The diff had added a helper whose docstring
  argued against restating the four-arg constructor, and then restated it four more times in two
  other files.
- **A test for the two authors**, which criterion 9's Testing Decision asked for and the first
  pass skipped: `test_the_author_that_could_not_ask_and_the_one_that_did_not_read_the_same` in
  `test_planner.py` asserts every term of both meters equal, and names the one thing that does
  differ as the author's answer rather than the meter's.

#### Not taken, with reasons

- **Deriving `evidence.py`'s camelCase budget block from the dataclass fields** (Standards,
  Shotgun Surgery). The bundle's field names are its public shape; deriving them from Python
  attribute names would let a local rename silently change what an evidence bundle publishes.
  The restatement is the seam, and every other block in that module restates too.
- **`TOOL_CALLS_PER_ASK` and `RETURNED_CHARS_PER_ASK` are sized for tools that do not exist**
  (Standards, Speculative Generality; Spec, (c)(5)). The Standards agent overrode its own finding
  and was right to: this ticket is titled "before anything fetches" and its last Implementation
  Decision is that a budget added after the spending starts is one fitted to what happened.
  Criterion 6 is unticked to record the part that is genuinely unmet.
- **Old recorded proof bundles now carry a different budget shape** — the 2026-08-27 showcase has
  `modelCalls: 24` and no `returnedChars`. Nothing reads them programmatically and re-recording
  them would cost a paid Run to fix a cosmetic inconsistency. A reader comparing bundles across
  this change sees two shapes; that is what the change is.
- **A Run that overruns on its last turn and then renders is still not refused**, as recorded
  above. Unchanged by the review.
- **The replaced ordering test.** Spec correctly noted that a criterion-bearing test was deleted
  rather than added — `test_the_rate_line_is_read_before_the_character_line_it_would_also_blow`.
  The replacement walks the whole four-line order and was probed to fail when the order is
  changed, so nothing is lost, but it is named here because "replaced" is not "added".

#### Measured after the response

Crew pytest **338 passed, 1 skipped**. Workspace vitest **910 passed across 63 files**, the
baseline unchanged — this is a Python-only change.
