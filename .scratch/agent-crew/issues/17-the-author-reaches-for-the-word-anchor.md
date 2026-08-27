# 17: The author reaches for the word anchor

Status: ready-for-agent

## Problem Statement

The crew authors plans that never point at anything. Every event in the last measured Run —
15 of 15 — carries a Boundary anchor, and the plan is *correct*: it scores 51 pass / 6
not-evidenced and renders. What it does not do is cut the picture on the word the narrator is
saying, which is the difference between a video that illustrates a script and one that
performs it.

The cause is not that the author writes a Word anchor badly. It is that the author never
selects an Action that would require one. Across the eight SceneInstances of that plan it
chose the non-deictic sibling every time it had a choice — `annotate` over `highlightBar`,
`annotatePoint` over `focusPoint`, `annotate` over `focusEvent`. Because no Deictic field is
ever declared by the Actions it picked, `DEICTIC_ANCHOR_REQUIRED` never fires, and the two
teaching channels that carry the lesson — the check registry's `means`/`repair`, and the
`expected` list computed against the plan's own Beats — are both refusal-gated and therefore
silent. The author is never told it missed anything, because by the compiler's lights it
did not.

Two conditions hold it there.

**The Teaching surface is outvoted.** The ~130,000 characters of contract projections the
crew authors from carry 44 anchors: 35 Boundary, 9 Word. Seven of the nine are one
`advanceWord` idiom repeated down a single statement, so **exactly two anchors in the entire
prefix demonstrate a pointing gesture.** The catalog projection alone is 52% of the prefix
and is 30 Boundary anchors and no Word anchors, including `highlightBar` shown three times at
a Boundary — deliberately, and ADR-0012 is right that those stay.

**The incentive is asymmetric.** Writing a Word anchor risks two refusals: the word must
appear in that Beat exactly once, and it must land on the value the payload names. Writing
the non-deictic sibling at a Boundary risks nothing at all — it is legal, it scores, it
renders. Nothing in the system has ever cost the author anything for declining the gesture.
A careful author takes the safe verb, and that is what the measurement shows it doing.

There is a third condition, smaller and embarrassing: in the published manifest the word
"pointing" is attached to the wrong verb. `bar_chart.annotate`, which declares no Deictic
field, is described as *"Show a short annotation pointing at one bar."* `highlightBar`, which
is the pointing gesture, says only *"Bring one bar forward and recede all the others."* An
author looking for a way to point at a bar is being pointed at the wrong Action by the
Teaching surface itself.

## Solution

Make the omission visible before the plan is submitted, and make the gesture safe to attempt.

Three changes, none of which touches an example.

**The compiler learns to say that a pointing opportunity was declined.** A new quality
warning, `DEICTIC_OPPORTUNITY_MISSED`, reports a SceneInstance whose capability publishes a
pointing Action, which used none of them, and whose own props name a value the narration
speaks — naming the Word anchors that were available. It is a warning and not an error,
because declining to point is a legitimate editorial choice and the reasoning for that is
already recorded on the Actions that decline it.

**The crew reads that warning while it drafts.** `review` gains the same rule and surfaces it
pre-submission, through the draft-review tool the author now holds. This is the channel that
did not exist before the tool binding landed: the author can be told it missed a gesture at
the moment it can still cheaply choose otherwise, rather than after a Run.

**The manifest says what a Deictic field obliges, on the Action that declares it.** Today the
manifest publishes `deicticFields: ["label"]` as a bare list of field names. The reasoning —
that a focus is a pointing gesture, that "this one" is only true while the narrator is saying
it, that the anchor to write is therefore the word form — exists, beautifully, in source
docstrings the agent by rule 2 never sees. It gets published, and the descriptions that
mislead get fixed.

Together these close the asymmetry from both ends: declining the gesture starts costing
something, and attempting it stops being a gamble.

## User Stories

1. As the crew's Plan Author, I want the manifest to tell me which Actions are pointing
   gestures, so that I can choose one on purpose rather than by accident.
2. As the crew's Plan Author, I want an Action's description to reflect whether it points, so
   that I do not pick `annotate` because its description is the one that says "pointing".
3. As the crew's Plan Author, I want to know that a Word anchor can be checked before I
   commit to it, so that attempting the gesture is not a gamble against two refusals.
4. As the crew's Plan Author, I want to be told when a SceneInstance I wrote had a pointing
   opportunity and took none, so that omission is as visible to me as a mistake would be.
5. As the crew's Plan Author, I want that report to name the exact anchor strings I could have
   written, so that acting on it is a substitution rather than a research task.
6. As the crew's Plan Author, I want to read that report while I am still drafting, so that
   acting on it costs me no repair round trip.
7. As the crew's Plan Author, I want the report to stay silent on a SceneInstance that already
   points once, so that I am not pushed to point at every label in a chart.
8. As the crew's Plan Author, I want the report to stay silent when nothing in my props is
   actually spoken in the Beats the scene spans, so that I am not asked to invent a gesture the
   material does not support.
9. As the crew's Plan Author, I want the rule applied to the plan and never to a bare
   SceneInstance, so that it agrees with the rest of the deixis rules about where they are
   judged.
10. As the crew's Plan Author, I want the warning to be a warning, so that a plan whose
    annotations are deliberately timed to the justifying sentence still compiles.
11. As the crew's Plan Author, I want the code to appear in the published check registry with
    its own `means` and `repair`, so that I learn what it means from the same place I learn
    every other code.
12. As the crew's Plan Author, I want the compiler to actually emit any code the registry
    publishes, so that I am never taught a rule that is not enforced.
13. As an operator, I want a Run's evidence bundle to make the plan's Word anchor use legible,
    so that "did the author point at anything" is a number I can read rather than a plan I
    have to open.
14. As an operator, I want to be able to rehearse the whole change against the fixture
    provider, so that measuring whether it worked costs no voice credit.
15. As an operator, I want the shipped reference plan to stay clean under the new warning, so
    that I can tell a real finding from a rule that fires on everything.
16. As an operator, I want the failing Run's own plan to light up under the new warning, so
    that I know the rule finds the defect it was written for.
17. As a capability author, I want to declare a pointing Action once and have both the
    compiler and the crew's pre-submission review honour it, so that a new capability does not
    need either of them edited.
18. As a capability author, I want the obligation a Deictic field creates to be published
    rather than living only in my docstring, so that the agent reads the reasoning I wrote.
19. As a capability author, I want an Action that declines to point to say so in its
    description, so that the distinction between the two siblings is legible before a plan is
    written.
20. As the next reader, I want the ADR position on examples to be visibly respected, so that
    nobody reads this ticket as licence to add the plan examples ADR-0012 rejected.
21. As the next reader, I want the reason this warning is not an error recorded where the
    decision lives, so that a later session does not "strengthen" it and break a legitimate
    editorial choice.
22. As a reviewer, I want the new rule expressed once per language and not once per
    capability, so that it does not become the per-capability bookkeeping `deicticFields` was
    moved onto the Action to escape.
23. As a reviewer, I want the Python rule and the TypeScript rule to agree on the same plans,
    so that the pre-submission reading is not a different rule from the compiler's.
24. As a reviewer, I want the crew's contract fixtures re-recorded in the same change that
    moves the manifest, so that the stale-fixture guard is satisfied deliberately rather than
    worked around.
25. As a reviewer, I want the leak scan to still pass over every new string that reaches a
    model, so that publishing more prose does not publish repository detail.

## Implementation Decisions

### The rule

Judged per SceneInstance, over a VideoPlan. It reports when **all** of:

1. The SceneInstance's capability publishes at least one Action declaring `deicticFields`.
2. The SceneInstance has events, and none of them uses such an Action.
3. At least one **complete leaf string value** of the SceneInstance's props, of one to five
   tokens, has every one of its tokens spoken **exactly once** in a Beat the scene spans.

The report names the Word anchors condition 3 found, in the shape `DEICTIC_ANCHOR_REQUIRED`
already uses for `expected`, so acting on it is a substitution.

Condition 3 is the load-bearing one and its exact form is a decision, arrived at by
prototyping the rule against two real plans. Two looser formulations were tried and rejected:

- **"The chosen Action carries a field a sibling would point at."** Rejected. This is
  precisely the conflation the domain glossary warns against — treating a Deictic field as
  "the payload mentions a word", *which is what `annotate` also does*. It fires on every
  annotation.
- **"Any token of the props appears in the Beat text."** Rejected on measurement: it fired
  twice on the shipped reference plan, matching stop-words out of headline and caption prose.

Matching whole leaf values rather than tokens is what excludes prose: a headline is a leaf
value of three or more tokens that is not spoken verbatim, while a chart label is a leaf
value that is. The one-to-five-token bound and the "land on any token" behaviour are taken
from the multi-word rule the existing deixis check already implements, so the two agree.

Measured on the two plans that matter:

| plan | scenes warned |
|---|---|
| the shipped reference plan (multi-capability, persistent placement) | **0** |
| the Run that provoked this ticket | **3 of 8** — `timeline`, `line_chart`, `bar_chart` |

with candidates including `b18.word:Hillside`, `b11.word:Harbour` and `b14.word:2027`. The
`image_context` scene stays quiet in both, correctly: `emphasize` takes authored stamp copy
rather than a reference into the scene's own data, so there is no sense in which a scene
"missed" one.

### Severity and the registry

`DEICTIC_OPPORTUNITY_MISSED` is a **warning** with `quality` severity, alongside the existing
motion-profile repetition warning, which is the precedent for a legal-but-worse editorial
choice reported to the agent with `means` and `repair`. It is not promoted to an error: an
annotation's timing legitimately follows the sentence that justifies it, which may be a Beat
away, and the reasoning for that is already recorded on the Actions that decline to declare a
Deictic field. Making this an error would contradict a decision the codebase has already
taken and would delete a real editorial freedom.

It is published in the check registry's warnings, and the compiler emits it. Those two go
together and neither ships alone — publishing a rule the compiler does not apply teaches a
rule that is not true.

### Modules and interfaces

- **Plan validation** gains the check. Its interface does not change: a VideoPlan in, a report
  of errors and warnings out. The new warning joins the warnings already produced per section.
- **The check registry** gains the code with `means` and `repair`. The repair names the Word
  anchor form and the fact that the alternatives are listed on the finding.
- **The catalog builder** publishes, per Action, the prose a Deictic field obliges. The
  declaration stays on the Action, exactly as `deicticFields` does, so a new capability
  declares once and reaches both consumers. **No new manifest field is introduced if the
  existing description strings can carry it** — the first attempt is to fix the descriptions
  themselves and publish the obligation as part of the Action's own description, because that
  is the string the author reads while choosing a verb. `manifestVersion` moves only if that
  proves impossible, and the ticket should say so rather than bumping it silently.
- **The Action descriptions** are corrected. The pointing Action's description says it is a
  pointing gesture and that its anchor must name the word; the non-deictic sibling stops using
  the word "pointing". One capability already does this correctly — `image_context.emphasize`
  reads *"Stamp one spoken word or short phrase over the image, as the narrator says it"* —
  and it is the pattern for the other four.
- **The crew's `review`** gains the same rule and learns to read the registry's **warnings**,
  not only its errors, so the finding carries the published `means` and `repair` like every
  other. Its signature is unchanged: a plan and the Teaching surface in, findings out.
- **The author's preamble** gains one sentence: that a Word anchor can be checked with the
  draft-review tool before the plan is submitted. It is added only for an author that holds
  the tool, so a scripted Run's prefix stays byte-identical.
- **The crew's recorded contract fixtures** are re-recorded in the same change, because the
  manifest bytes move and the stale-fixture guard exists to catch exactly that.

### What is deliberately not built

The four missing structural plan examples. ADR-0012 considered and rejected a structural plan
example per deictic Action, and records that one was written and removed the same session; a
fourth copy of the rule scales the wrong way and attaches an obligation to every future
Deictic field. This ticket works inside that decision. The doorway it uses is ADR-0012's own
final consequence: the ADR settles that *a refusal may carry a lesson an example cannot*, and
explicitly disclaims covering the surface the agent reads **before** it writes. That surface
is where this defect lives, and the ADR says plainly it is not licence to leave it thin.

## Testing Decisions

A good test here asserts on what a caller can observe — a report's codes and the anchors it
names, or the findings `review` returns — and never on how the check walks the plan. The
prototype's two-plan comparison is the shape to keep: a rule that fires on the defect and
stays silent on the shipped reference plan is worth more than either half alone.

Three seams, all of which already exist and already have prior art. No new seam is introduced.

**Plan validation.** The highest seam for the rule. Prior art is directly adjacent: the
existing deixis block builds a small pointing plan and asserts the error's `field` and its
`expected` list, and the motion-profile test asserts a `quality` warning off the same report.
Cases: a scene that points is silent; a scene that could have pointed warns and names the
anchors; a scene whose props name nothing spoken is silent; a scene with no events is silent;
a multi-token label lands on any of its tokens; a word spoken twice in the Beat produces no
candidate, since suggesting an ambiguous anchor would be suggesting a refusal.

**The catalog builder.** Prior art already asserts that each Action's Deictic fields are
published and that they name fields the payload carries. Extended to assert that a pointing
Action's published description says so, and — the regression that matters — that a
non-deictic Action's description does not claim to point.

**The crew's review.** Prior art runs `review` over a catalog-following plan and asserts it
returns nothing, and over seeded defects and asserts the codes. Cases: the same plans as the
validation seam produce the same verdicts, which is the assertion that keeps the two
implementations honest; the finding carries the `means` and `repair` the registry publishes;
the existing "a clean plan is refused nothing" test still holds.

**Held to the existing guards.** The preamble sentence is covered by the leak scan that
already runs over every string reaching a model, and by the test asserting a scripted author's
prefix is unchanged. The contract fixtures are covered by the stale-fixture guard, which must
be green without a hand edit.

**Rehearsal, not proof.** Whether the change moves the author's behaviour is settled by
fixture Runs, which cost no voice credit, at n≥3 before and after, counting Word anchors per
Run. That measurement belongs to this ticket's close, and a single Run either way establishes
nothing: the model is nondeterministic and a previous session already has one unexplained
n=1-against-n=1 swing on the record.

## Out of Scope

- **Reversing or amending ADR-0012.** If the measurement afterwards shows the author still not
  pointing, that is evidence for reopening it and should be taken there, with the numbers.
- **Adding structural plan examples for the four undemonstrated pointing Actions.** Rejected
  above, for the ADR's reasons.
- **Promoting the warning to an error.** Recorded as a decision, not deferred work.
- **Any change to the anchor grammar.** The word form, its constraints and its published
  example are correct and are not the problem; ADR-0009 governs and the grammar does not widen.
- **Giving catalog examples a synthetic word table.** Rejected in ADR-0012 and the reasoning
  lives in the synthesiser itself.
- **Binding the catalog search and scene-spec tools.** Still unbound, still architectural — it
  means replacing the flattened cached prefix with on-demand lookups.
- **A post-Take repair pass over anchors.** The deferred quality-agent loop, with its recorded
  oscillation risk. The author should choose the gesture, not have one retrofitted.
- **The preview-duration boundary defect** carried from earlier sessions. Unrelated and
  unfixed.

## Further Notes

The draft-review tool that makes the pre-submission channel possible is ticket 18, which
landed immediately before this one. Before it, a finding could only reach the author after
submission, which is why "tell the author it missed a gesture" was not previously a cheap thing
to propose. Ticket 18 also settles where `review` reads the check registry from, which
this ticket extends from the registry's errors to its warnings.

Two numbers worth carrying: the prefix is 44 anchors, 35 Boundary and 9 Word, of which two
demonstrate a pointing gesture; and the catalog projection is 52% of the prefix and 30
Boundary anchors to none. If a later session wants to argue that the Teaching surface is
balanced, those are the numbers to re-measure rather than re-reason about.

**Blocked by:** None (can start immediately)

- [ ] The compiler reports a declined pointing opportunity as a `quality` warning, naming the Word anchors that were available
- [ ] The shipped reference plan produces no such warning
- [ ] The plan from the Run that provoked this ticket produces one on its timeline, line chart and bar chart scenes
- [ ] The code is published in the check registry with `means` and `repair`, and the compiler emits it
- [ ] A pointing Action's published description says it points and names the anchor form it obliges
- [ ] No non-deictic Action's description claims to point
- [ ] `review` returns the same verdict as the compiler on both plans, carrying the published `means` and `repair`
- [ ] The author's preamble says a Word anchor can be checked before the plan is submitted, and only for an author holding the tool
- [ ] A scripted Run's instruction prefix is byte-identical to what it was
- [ ] The crew's contract fixtures are re-recorded and the stale-fixture guard is green with no hand edit
- [ ] The leak scan passes over every new string that reaches a model
- [ ] Fixture Runs at n≥3 before and after are recorded, with Word anchors per Run counted either way
