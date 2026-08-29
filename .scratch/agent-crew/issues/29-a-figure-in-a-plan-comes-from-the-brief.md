# 29: A figure in a plan comes from the Brief

Status: ready-for-agent

## Problem Statement

**The author invents data rather than skip a chart, and nothing in the system asks where a number
came from.**

The `noise-cancelling-free-choice-v1` Run was authored against a Brief about how noise-cancelling
headphones work. **The Brief contains zero numerals.** The plan contains a bar chart titled *"Noise
reduction by sound type"* with four data points — Engine hum 85%, Road traffic 75%, Office chatter
40%, High pitch 20% — invented wholesale.

It passed everything. Validate on the second attempt, Preflight, compile, render. The narration
stayed clean: no numeral appears in any of the eleven beats, verified, so nothing false is
*spoken*. The invention is entirely on screen, which is the half nobody checked.

**Nothing between authoring and render asks whether a figure has provenance.** Not the compiler,
not Preflight, not `review`, not the draft-review tool, not the crew. There is no check for it
because there has never been a reason for one: every Brief before this was fictional, and Helios
Bay's numbers being made up was the point of Helios Bay. The moment a Run is about a real subject
— which is the direction the project has now taken — it becomes the most consequential silent
failure in the pipeline.

The cause is structural rather than a lapse in the model. **An author that must produce a chart,
has no researcher to ask and no way to decline, has exactly one option available to it.** Ticket
11 gives it somewhere to ask; ticket 13 gives it somewhere to stop. Neither, on its own, makes
inventing a figure *visible*, and a capability that is available and unmonitored will be used.

There is a smaller artifact from the same Run worth recording, because it is a real cost of a
mechanism this project is otherwise pleased with. Beat 7 reads *"sounds like Engine hum and road
traffic"* — capital E mid-sentence — because a word anchor must match the chart label exactly. The
deixis mechanism bends prose to make pointing work, and the prose it bent here was pointing at a
figure that did not exist.

## Solution

**A published check that asks where a figure came from.**

Not crew code. The evidence for that choice is on the record and it is unusually direct: in the
`023535` Run, an author holding the draft-review tool wrote **zero** word anchors. What moved it
to four was not a better prompt and not a guard — it was `DEICTIC_OPPORTUNITY_MISSED` existing as
a code for the tool to *say*. A crew-side guard catches a fabrication after the fact. A published
code teaches against it while the plan is being written, is readable by the draft-review tool, and
arrives in the repair loop in the compiler's own vocabulary like every other finding.

The check reads the numerals a plan's props carry and asks whether each traces to the Brief — or,
once ticket 11 lands, to a grounded research answer the Run actually received. What it reports
where it cannot trace one is a warning with a severity, not an error, and the reasoning is in
Implementation Decisions below.

## Implementation Decisions

- **It is a check in the published `checks` vocabulary, with a `means` and a `repair`, like every
  other code.** That is what makes it reach the author while drafting rather than only after a
  refusal. The production sibling ticket owns the code's definition; the crew's half is reading it
  like any other.
- **It is a warning, not an error, and this is the load-bearing decision.** A Brief may legitimately
  authorise a figure it does not itself state, a researcher will legitimately supply figures the
  Brief never carried, and a chart of illustrative proportions is a real editorial form. An error
  would make all three impossible and would be routed around within a week. What the warning must
  do is *name the figure and say it could not be traced*, so that an operator reading a compile
  report sees which numbers on screen have no source. The severity should be `important` — this is
  the class of defect that reaches an audience.
- **Provenance is traced against the Brief and against research answers, not against the world.**
  The check is not a fact-checker and must not be described as one. It answers one question: did
  this number come from something the Run was given. A figure that traces to the Brief and is
  wrong about reality is out of scope and always was.
- **Matching is on the figure, and the matching rule is published.** Whether `85%` traces to a
  Brief saying "about eighty-five percent", or `1.2 million` to "1,200,000", is a decision that
  belongs in the contract where an author can read it, not in a regex an author cannot see. Start
  strict and widen with evidence; a check that silently accepts near-misses teaches nothing.
- **Narration is checked as well as props, even though it was clean here.** The Run that motivated
  this happened to keep numerals out of the voice-over, and there is no mechanism that made that
  true. A spoken invented figure is worse than a displayed one.
- **Interlock with tickets 11 and 13 is explicit.** This check makes fabrication *visible*; the
  researcher makes it *unnecessary*; the decline makes it *avoidable*. All three are wanted and
  none substitutes for another. This one is independently useful and should not wait on either.
- **A Brief declared as test data is exempt, and the exemption is explicit rather than
  incidental.** Helios Bay's figures are invented on purpose. Ticket 11 already establishes that
  declared test data changes behaviour — zero research calls, asserted as a count — and the same
  declaration should silence this check, visibly, rather than the check happening not to fire.

## Testing Decisions

**The motivating case is a fixture.** A Brief with no numerals and a plan carrying a bar chart with
four invented values reports the code, names the four figures, and does so at `important`. This is
the regression that must never quietly stop working, and it is reconstructible from the Run
artifacts: the plan is at `run-5a3a2529f2d1/plan.json` in that Run's work root.

**A traced figure does not report.** A Brief stating a figure and a plan using it produces nothing,
including across reasonable formatting differences the published matching rule admits.

**Declared test data is silent, asserted as an absence.** The Helios Bay fixtures must not start
reporting a wall of warnings, and the reason they do not must be the declaration rather than luck.

**Narration is covered.** A plan whose beats speak an untraceable figure reports it, distinctly
from one whose props display it.

**The author sees it while drafting.** The code appears through the draft-review tool for an author
that holds one, which is the mechanism the whole solution rests on — this is the assertion that the
`DEICTIC_OPPORTUNITY_MISSED` precedent actually transfers.

**No network, no key, no model**, over the recorded fixtures, like every other crew test.

## Out of Scope

- **Fact-checking.** The check asks for provenance within the Run, never for truth in the world.
- **The researcher.** Ticket 11. This check does not fetch anything and does not need to.
- **The decline.** Ticket 13.
- **Preventing the author from authoring a chart.** A chart with untraceable figures is reported,
  not refused. The compiler is the only authority on a plan and this does not change that.
- **The word-anchor prose artifact.** Recorded in Further Notes as a cost of the deixis mechanism;
  fixing how anchors bend prose is a different ticket and probably ADR-0009 territory.

## Further Notes

**This finding has no ticket until this one, and it is the most consequential thing on the record
from the last three sessions.** It was found by running a free brief about a real subject, which
had never been done before. Every prior Run used the showcase brief, which *orders* eight
capabilities and supplies its own fiction — so the entire class of defect was invisible by
construction.

**The 5-of-8 result from the same Run belongs to ticket 28, not here.** It is the same Run and a
different finding.

**Blocked by:** None (can start immediately; needs its production sibling for the code's
definition)

- [ ] A published check reports a figure in a plan that traces to neither the Brief nor a research answer
- [ ] It is a warning at `important` severity, and names the untraceable figures rather than only counting them
- [ ] The matching rule is published where an author can read it, not held in the crew
- [ ] Narration is checked as well as props, and the two report distinctly
- [ ] A Brief declared as test data silences the check by the declaration, asserted as an absence
- [ ] The `noise-cancelling-free-choice-v1` case is a fixture and reports all four invented figures
- [ ] A traced figure reports nothing, across the formatting differences the published rule admits
- [ ] The code reaches an author through the draft-review tool while drafting
- [ ] No test reaches a service, a key, a model or the network
