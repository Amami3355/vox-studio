# ADR-0009 — The anchor grammar does not widen

**Status:** proposed · 2026-08-15
**Scope:** the vocabulary an agent may write for a point in time inside one beat. Extends
ADR-0002, which built the grammar and its two branches; nothing in that document is
superseded.

**Reverses a premise, not a decision.** `docs/render-surface.md` §Z7 and
`BarChartScene/layouts.ts` both record that "from `end` the agent's entire vocabulary is
`-short` (0.4 s) and `-long` (1.13 s), so *well before the end of this beat* is a sentence
the grammar cannot say", and both name widening the grammar as the open item. The grammar
can say it. It has been able to since the word branch landed on 2026-08-13, and the plan
that produced the complaint uses that branch twice in the same beat.

## Context

Two scenes in the shipped Northbridge run put their annotation on the last second of a
half-minute shot:

| scene | beat | length | `annotate` written at | lands |
| --- | --- | --- | --- | --- |
| `weekday-boardings` | b2 | 833 f · 27.8 s | `b2.end-long` | 96% in |
| `pilot-budget` | b6 | 728 f · 24.3 s | `b6.end-long` | 95% in |

Each scene spans exactly one beat, and each beat is a paragraph. That is what makes the
boundary branch look impoverished, and the arithmetic is worth stating because it is worse
than "two options from the end".

**Boundary offsets are rhythm tokens, so they do not scale with the beat.** `short` and
`long` resolve through `OFFSET_FRAMES` to `motion.duration.quick` (12 f) and
`motion.duration.slow` (34 f) — absolute frame counts, chosen for how long a transition
should take. Applied to `start|mid|end`, the whole boundary branch of a 833-frame beat
reaches eleven frames:

```
0  12  34 … 383 405 417 429 451 … 799 821 833
```

Three knots about 1 s wide, and between them two holes of 348 and 349 frames — **11.6 s
each, 84% of the beat unreachable**. b6 is the same shape: two holes of 296 frames, 81%.
No new offset token repairs that. A token is an absolute duration; adding `base` (20 f) or
`instant` (6 f) makes the knots denser and leaves the holes exactly where they are.

**But the holes are reachable, by the other branch.** Word anchors take no offset and land
on the frame the narrator begins a named word, anywhere in the beat. Resolved against the
real take:

| anchor | lands | the sentence it opens |
| --- | --- | --- |
| `b2.word:steady` | 584 f · 70% | "This was a **steady** climb, not a single opening-month surge" |
| `b6.word:leaving` | 292 f · 40% | "**leaving** half a million unspent" |

Those are the sentences that justify the two annotations — `+6,000 from the starting point`
and `0.5m below the allocation`. Naming them moves the callout **7.2 s** earlier in
`weekday-boardings` and **13.4 s** earlier in `pilot-budget`, with no change to any code,
any schema, or any grammar.

**Nothing restricted the branch to deictic actions.** `deicticFields` creates an
*obligation* for the actions that declare it; it has never been a permission gate. The
proof is in the same plan: `revealAll` declares no deictic field and is anchored
`b2.word:January`, mid-beat, in the same scene whose `annotate` two events later fell back
to `end-long`.

**So the defect is in what the manifest teaches, which rule 2 makes the serious kind.**
`ANCHOR_GRAMMAR.forms` tells the agent to use a boundary "when the event follows the shape
of the sentence rather than any particular word in it", and to use a word "when the event
must land on what is being said — an action listing `deicticFields` is saying exactly that".
An agent reading only that reasonably concludes the word branch belongs to declared
pointing gestures. `annotate` declares none, and its timing comes from a sentence — which
the boundary text describes and the word text does not claim.

## Decision

**The grammar does not gain a form, an offset token, or a proportional position.** The
vocabulary already reaches every frame that any measured case wanted. What changes is the
`means` prose in `ANCHOR_GRAMMAR.forms`, so that an event whose timing is justified by a
sentence knows it may name a word from that sentence, whether or not its action declares a
deictic field. One string, published to `catalog.json` by the existing generator, no
`manifestVersion` bump — the language is unchanged, only its description.

### Considered and rejected

**Proportional positions** — extending the boundary branch to `start|early|mid|late|end`,
or an explicit `<beatId>.at:3/4`. This is the honest fix for the 84% hole and it scales with
the beat, unlike an offset token. Rejected because no measured case needs it: both scenes
that provoked this document have a justifying sentence, and a fraction of a paragraph is a
*weaker* thing to write than the word that opens the clause. ADR-0002 closed its own open
question by measuring rather than by reasoning, and the measurement said snapping would not
have helped; the same discipline applies here. Recorded rather than dismissed — an event
tied to no spoken word at all (a camera move, a `showBaseline` that should begin two-thirds
through) has no way to say so today, and if one is ever written down this is the branch to
adopt.

**More offset tokens** — rejected on the arithmetic above. They are absolute durations and
the problem is proportional.

**Shorter beats** — telling the writing agent that a 28-second beat is a paragraph and
should be three beats, which would make `start|mid|end` sufficient by construction. This is
ADR-0002's own line, that "the writing agent's beat granularity, not the anchor, is what
buys precision". Rejected as the *primary* repair because it inverts the dependency: beats
are units of narration, and chopping prose to give the picture more anchor points lets the
edit dictate the script. Word anchors buy the same precision and cost the script nothing.
It remains good advice for the narrative agent, and belongs there rather than here.

**Making `annotate` deictic** — declaring `deicticFields: ['label']` on it, forcing a word
anchor. Rejected, and ADR-0002 already rejected it for the right reason: `annotate`'s label
names the bar, but the event's timing comes from the sentence that justifies the note, which
may be a beat away from where that bar is named. Forcing the anchor onto the label's word
would pin the note to the wrong moment with complete precision — the failure mode the word
branch was built to end.

## Consequences

- The two callouts in the Northbridge plan are repairable by editing two anchor strings.
  That is a **plan** edit, not a code change, and the plan is the agent's — this document
  does not make it, and re-rendering costs 220 s and no money.
- Nothing enforces the new guidance. An agent may still anchor a sentence-justified event to
  `end-long`, and the compiler will accept it, because a callout on the last second is a
  legal video and not a broken one. That is deliberate: rule 5's soft reading, and the
  reason this is a wording change rather than a check.
- The 84% hole in the boundary branch is real and stays open. It is now written down with
  its arithmetic, so the next reader meets a measured gap and a rejected repair rather than
  the false claim that the grammar cannot reach past `end-long`.
- `docs/render-surface.md` §Z7 and `BarChartScene/layouts.ts` both still carry that false
  claim and want the same correction they received on 2026-08-15 for the previous one.
- Word anchors need a recorded take. Catalog examples run on `syntheticBeats` with
  `words: []` and cannot illustrate the guidance this document sharpens — the same
  constraint ADR-0002 accepted when it put deictic landing on plans rather than instances.
