# ADR-0010 — The midpoint anchor is retired

**Status:** accepted · 2026-08-15
**Scope:** the boundary branch of the anchor grammar. Narrows ADR-0002's `start|mid|end` to
`start|end`. ADR-0009 stands: this is not the proportional-position widening it rejected.

**A narrowing, and the first one.** Every previous decision about this vocabulary added a
form or sharpened a description. This removes a form that has been legal since ADR-0002 and
that the shipped Northbridge plan uses three times. `manifestVersion` becomes **4**.

## Context

ADR-0009 moved two late callouts onto word anchors and was re-rendered to check. The first,
`b2.end-long` → `b2.word:steady`, landed as measured: frame 799 → 584, 7.2 s earlier, against
a chart the reader can already see.

The second did not. `b6.end-long` → `b6.word:leaving` moved the note from frame 694 to 292,
the 13.4 s ADR-0009 promised — but `revealAll` in the same scene sits at `b6.mid`, which
resolves to **364**. The callout now precedes the bar it describes by 72 frames. Late became
early, and the rendered frame shows a note about spending beside a chart with no spending on
it.

**The anchor was right and the neighbour was unknowable.** `b6.mid` is not a claim about the
narration. It is `from + (to - from) / 2` — a fraction of a duration that does not exist
until the take is recorded. The agent wrote `mid` meaning "when I talk about the money", and
had no way to discover it would land after "leaving".

Measured across all seven beats of the shipped take, `mid` lands where a sentence begins in
four, and inside a sentence already in progress in three — 6.8 s into one, 5.9 s into
another, 3.5 s into a third. Which of the two happens is a property of the recording, not of
anything written:

| beat | `mid` lands |
| --- | --- |
| b1 | 6.8 s into a sentence |
| b2 | on a sentence start |
| b3 | 3.5 s into a sentence |
| b4 | on a sentence start |
| b5 | on a sentence start |
| b6 | on a sentence start |
| b7 | 5.9 s into a sentence |

**The property worth protecting is order, not precision.** Two events that both name a word
fire in the order their words are spoken, and the agent can verify that by reading the beat
text it wrote — before any take exists, with no arithmetic. A word cannot be ordered against
a fraction. One `mid` in a scene is enough to make the whole scene's ordering a fact about
the recording rather than a fact about the script, which is what happened in b6.

`start` and `end` are not exposed to this. They are the edges of the beat, they are where the
narration was already going to be, and their relationship to every word in the beat is known
without measurement: everything comes after `start` and before `end`.

## Decision

**The boundary branch becomes `<beatId>.start|end`.** `mid` is removed from `AnchorTarget`,
from `BOUNDARY_RE`, from `ANCHOR_GRAMMAR.forms`, and from every rejection message that
offered it as the correction. `b2.mid` no longer parses and raises `UnknownAnchorError` — a
loud refusal, not a silent resolution to the halfway frame.

Offsets are untouched: `start` and `end` still take `±short` and `±long`.

`scene` keeps the boundary form and loses `mid` with the rest. `scene.mid` was the third
example in the grammar's own `examples` list, which is a fair measure of how ordinary this
form looked.

This is a language change, so `manifestVersion` goes to **4** and the four
`catalogManifestVersion` sites in `packages/production/src/commands/service.ts` follow it.

### Considered and rejected

**Keep `mid` and add an ordering check** — refuse a plan whose events compile out of the
order they are written in. This catches the b6 defect directly and touches no language.
Rejected as the primary repair for two reasons. `resolveEventTimings`
(`packages/video/src/core/anchors.ts`) maps the event array without regard to order, and
nothing else in the system treats that array as ordered, so the check would need its own
decision about what event order *means* before it could reject anything. And it repairs the
symptom at the wrong end: the agent would still be writing an anchor whose landing it cannot
predict, and would learn about the collision only from a rejection. Removing `mid` lets it
get the answer right from the text. Worth revisiting on its own merits — ordering is a real
property and nothing currently guards it — but not as a way to keep `mid`.

**Proportional positions** — `start|early|mid|late|end`, or `<beatId>.at:3/4`. ADR-0009
rejected these as a *widening* and the rejection holds here for a stronger reason: every
argument above applies to `at:3/4` exactly as it applies to `mid`. A fraction of a beat is
unorderable against a word no matter how many fractions the grammar offers. If the gap
ADR-0009 recorded — an event tied to no spoken word at all — is ever written down, that is
still the branch to adopt, and it should be adopted knowing it reintroduces this problem.

**Deprecate rather than remove** — keep `mid` parsing, emit a warning, delete it later.
Rejected under rule 5's loud half. A warning that still resolves to frame 364 still ships a
callout ahead of its bar; the whole value of the change is that the plan stops compiling.
The migration is mechanical and the corpus is four call sites and one shipped plan.

## Consequences

- **The Northbridge plan no longer compiles.** It writes `b3.mid`, `b5.mid` and `b6.mid`.
  That plan is the agent's and this document does not edit it; the repair is to name the
  word that opens the sentence each `revealAll` was waiting for. For b6 that is
  `b6.word:spent`, which precedes `b6.word:leaving` in the text and therefore in the video.
- **Any agent trained on `manifestVersion: 3` will still write `mid`.** It gets
  `UnknownAnchorError` naming the two forms that remain. This is the intended teaching
  mechanism and the reason deprecation was rejected — see `tests/anchors.test.ts`, which
  guards the rejection rather than the removal.
- **Placements narrow too, not only events.** Anchors are the vocabulary for both, so a
  persistent element can no longer move at the midpoint of a beat either. `compile.test.ts`
  carried exactly such a placement.
- The 84% hole ADR-0009 measured in the boundary branch is now larger by design, and that is
  the point rather than a cost: the branch reaches the two frames it can describe honestly,
  and the rest of the beat belongs to the word form.
- Catalog examples are unaffected in capability and affected in fact: they run on
  `syntheticBeats` with `words: []` and so can only ever write boundary anchors. One example
  used `b2.mid` and now uses `b2.start+long`. An example that wants a genuinely mid-beat
  moment still cannot have one — the constraint ADR-0002 accepted, unchanged and still open.
