# ADR-0011 — The written order of a scene's events is binding

**Status:** accepted · 2026-08-15
**Scope:** the `events` array of a scene instance. Adds one compile-time refusal,
`EVENTS_OUT_OF_ORDER`. No anchor form changes, no schema changes, and `manifestVersion`
stays at **4** — the manifest gains a check, not a new shape.

**ADR-0010's rejected alternative, adopted on its own merits.** That document declined this
check as a *way to keep `mid`* and recorded it as worth doing anyway. It is done here, after
`mid` is gone, and what it mostly does is write down a rule nobody had written down.

## Context

A scene lists its events as an array, and nothing in the system reads that array as an
order. `resolveEventTimings` (`packages/video/src/core/anchors.ts`) maps it. `resolveEvents`
(`packages/video/src/core/events.ts`) then **sorts by frame** before folding, so the written
order is discarded at the last moment it could have mattered. The array is a bag, and the
picture is whatever the frames say.

That sort is why the b6 defect was silent rather than loud. `annotate` at `b6.word:leaving`
resolved to frame 292 and `revealAll` at `b6.mid` to 364; the list read reveal-then-annotate
and the render played annotate-then-reveal, and nothing between the two had an opinion.
ADR-0010 removed the anchor that made that collision unpredictable. It did not make the
collision *reportable*, and it did not need to: two word anchors can still be written in one
order and play in another, through a beat rewritten after its events were placed, a scene
whose `spansBeats` moved, or a plain transposition.

**Nothing declared the array ordered, which is exactly why nothing could enforce it.** The
schema is `z.array(semanticEventSchema)` with no comment (`catalog/plan-shape.ts`), and
`SemanticEvent` says nothing either. A check written before this decision would have been
enforcing a rule that no document claimed and that a well-formed plan could reasonably
break. So the decision comes first and the check follows from it.

## Decision

**A scene's events play in the order they are written.** Each event must resolve to a frame
at or after the frame of the event written above it. A plan whose events resolve otherwise
is refused with `EVENTS_OUT_OF_ORDER`, naming both events, both anchors, both frames and the
distance between them.

**Equal frames are legal, and the rule is `at or after` rather than `strictly after`.** Two
events on one moment — `b1.start` twice — is ordinary authoring rather than a mistake, and
`resolveEvents` already folds such a pair in written order, because `Array.prototype.sort`
is stable. A strictly-increasing rule would refuse plans that were never wrong, and would
make the fold order it depends on unreachable.

**It is a compile check and it could not have been a schema one.** `validateVideoPlan` sees
strings. `b6.mid` and `b6.word:leaving` cannot be ordered against one another until a Take
says when "leaving" was spoken, and `b2.start+long` cannot be ordered against any word at
all without frames. So this joins `BELOW_MIN_DURATION` as a check a plan alone cannot
answer: it runs in `compile()`, on the frames `resolveEventTimings` just produced, and is
collected with the other errors rather than thrown, so one repair pass sees every scene.

The refusal costs a recompile and never a recording. `recordingInputIdentity`
(`packages/production/src/contracts/protocol.ts`) is ordered beat text plus provider, voice,
model and seed — anchors are not in it, so re-anchoring an event never invalidates a take.

### Considered and rejected

**A text-only check at validate time.** Word order within one beat is readable from the beat
text the agent wrote, and beat order is readable from `spansBeats`, so a useful part of this
rule can be enforced before any take exists — which is attractive, because ADR-0010's whole
argument was that the agent can settle ordering from the script alone. Rejected because it
cannot be complete: a boundary anchor with an offset lands about a second in from an edge,
and no amount of text says whether a given word falls before or after it. The result would
be a rule that passes at validate and refuses at compile, which is two different answers to
one question and worse than one late answer. The seam may still be worth adding later as a
strictly earlier report of the same code, never as a different rule.

**Warn instead of refuse.** Rejected under rule 5's loud half, for the reason ADR-0010
rejected deprecating `mid`: a warning that still compiles still ships a callout ahead of its
bar. An out-of-order list is not a quality judgement about pacing — it is the plan and the
render disagreeing about what the author wrote, and there is no reading under which the
render is right.

**Leave the array unordered and say so instead.** The honest alternative: document that
events are a set, that the frames alone decide, and let the sort in `resolveEvents` be the
whole truth. Rejected because the array is written top to bottom by an author who means it
that way — the shipped plan reads as a script, ADR-0010's own repair reasoned about which
word "precedes" which — and a vocabulary that lets an author express an order it then
ignores is the silent-fallback shape rule 5 exists to remove.

## Consequences

- **Nothing in the repository has to move.** All four catalog examples
  (`scenes/BarChartScene/examples.ts`) already list their events in play order, as does the
  repaired Northbridge plan. The rule is a floor under existing practice rather than a
  migration.
- **The sort in `resolveEvents` becomes redundant for compiled documents and stays.** It is
  the runtime's own guarantee of determinism and it also serves `ExampleScene`, which
  renders an instance without going through `compile()`. Removing it would trade a check
  that is now enforced upstream for a rendering that depends on an upstream check having
  run.
- **A scene whose events cannot be ordered honestly now has no way to say so.** That is
  intended and it is a real narrowing: the only escape is to write the events in the order
  they play, which is what the rule is for.
- **Placements are not covered.** A persistent element's `at` anchors are ordered by the
  ladder in `resolvePersistentLayer`, not by the array they are written in, and this
  decision does not reach them. Whether the same rule should apply there is open, and is a
  question about placements rather than about events.
