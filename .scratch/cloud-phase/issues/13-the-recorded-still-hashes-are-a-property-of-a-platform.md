# 13: The recorded still hashes are a property of a platform, not of a render

Status: done — seam built; recording a Linux set is unassigned
Type: grilling
Blocked by: —

## Question

Spike 11 ran the full `test:render` suite inside the Linux image and reported **14 failed / 178
passed / 3 skipped**. Every failure is a still-hash comparison, and each differs in every hash rather
than in one. `packages/video/tests/render/quote.test.ts` was re-run on the Windows host in the same
session and passes there. Font rasterization differs between Windows and the Linux image; the hashes
were accepted on Windows in August. **This is a platform property, not a regression.**

It has been deferred in four consecutive handoffs — `-c` item 4, `-d` item 3, `-e` item 2, `-f` item
2 — without once being picked up, which is the reason this ticket exists rather than a fifth
deferral. It blocks nothing today. It becomes ticket 09's problem on the day ticket 09 asserts that
recorded fixtures are unchanged across the whole phase, because **that assertion cannot currently
hold on both platforms at once**, and the day it is discovered is the worst day to decide it.

The decision this ticket takes is that a recorded hash is scoped to the platform that recorded it.
The work is to make the suite say so. What it must not become is a re-acceptance of the Linux set as
canonical — that inverts which platform is trusted, and nobody has argued for the inversion.

## What the ground actually looks like

Measured on 2026-09-02 at `62d1494`, not inherited:

- **Thirty-two recorded 32-hex literals across seven files** — `character-explainer` (6),
  `line-chart` (5), `typographic-statement` (5), `image-context` (4), `quote` (4), `stat-counter`
  (4), `timeline` (4). These are the assertions that move.
- **Twenty-six assertions compare two renders to each other** rather than to a literal —
  `expect(hashStill(first)).toBe(hashStill(second))`, and the `.not.toBe(...)` relations that say a
  driven example differs from a canonical one. **These are platform-agnostic and must survive
  untouched.** They are the ones carrying the determinism and relation claims, and they are worth
  more than the literals.
- **There is no single seam.** `hashStill` lives once, at `packages/video/tests/render/harness.ts:121`
  (md5 over the PNG bytes), but `renderHash` is defined independently in **six** test files, and
  `line-chart` and `timeline` call `hashStill` directly. A platform-scoped comparison has to be
  introduced somewhere both shapes can reach.

## What the answer must settle

- **Where the scoping seam goes**, given there are two call shapes and six local `renderHash`
  definitions. A helper in `harness.ts` that takes a per-platform record is the near neighbour;
  whether the six local definitions collapse into it is a separate question and may be declined.
- **What a missing record for the current platform does.** A Linux set does not exist yet, so the
  honest options are to skip with a named reason or to fail with one. **Skipping silently is the one
  outcome this ticket exists to prevent** — an unrecorded platform must be visible as unrecorded,
  the same rule ticket 12 applies to the proof sheet.
- **What identifies a platform.** `process.platform` is the cheap answer and may be too coarse: the
  divergence is a font-rasterization property, so two Linux images with different font stacks are
  not obviously the same platform. Name the identifier and say what it does not distinguish.
- **That the twenty-six relational assertions are untouched**, explicitly, and that the change is not
  allowed to weaken them into literal comparisons on the way past.
- **What ticket 09 then asserts.** Its claim becomes *unchanged for the platform that recorded them*,
  and the ticket should say so in ticket 09's own words rather than leaving it to be re-derived.
- **Whether a Linux set is recorded now or later, and by whom.** Recording it is not this ticket's
  work, but the decision of who owns it is, or it becomes a fifth deferral in a new costume.

## Further Notes

- **Spike 11's finding 2 moves these hashes again if it is ever taken.** Self-hosting the four
  `@remotion/google-fonts` faces as local `woff2` files in the image removes the egress and makes the
  fonts a property of the image — and changes every accepted still hash. The map records that the
  font decision currently leaves them where they are, so the two are no longer entangled. A
  platform-scoped design survives that repair; a re-accepted Linux canon does not.
- **The service render is green in the container.** These tests are not part of it, which is why this
  blocks no deployment.

## Answer

**Settled 2026-09-06, seam only.** The decision the map already carried is now built: a recorded
still hash is scoped to the platform that recorded it, and the Windows set stays canonical. No hash
was re-accepted, no hash moved, and no Linux set was recorded.

**Where the seam went.** A new module, `packages/video/tests/render/still-hashes.ts`, holding two
functions rather than one because the suites have two call shapes and neither was worth rewriting
into the other: `expectRecordedStills` for the five files that compare a whole named record, and
`expectRecordedStill` for the two that assert a single value. Both take the literals keyed by
platform, so the accepted hashes stay next to the prose that accepted them — the acceptance comments
moved with their literals and were not summarised on the way.

It is *not* in `harness.ts`, which the ticket named as the near neighbour. The reason is that
module's own argument for itself: it is deliberately one method, and it is the render *lifecycle* —
a bundle, a browser, a temporary directory and their teardown. An assertion helper is a different
concern and widening the lifecycle interface to hold it would cost the property the file was
factored for. This follows `png.ts`, which is the precedent for pulling a pure function out rather
than into it.

**The six local `renderHash` definitions were left alone**, which the ticket allowed. They differ
from one another — assets, frames, prop shapes — and each is three lines. Collapsing them is a
readability question with no bearing on platform scoping, and doing it here would have mixed a
refactor into a change whose whole value is that it is mechanical and reviewable.

**What a missing record does: it fails, with a named reason.** Not a skip. A skip on an unrecorded
platform leaves a green suite that checked none of the accepted key frames, which is the same
dishonesty ticket 12 refuses in the proof sheet — not evidenced, never omitted. The failure names
the running platform, lists the platforms that do have a set, states that this is not a regression,
and argues against the one-copy-paste shortcut it invites: a hash is accepted by a person inspecting
the frame it names, so the observed value must not be pasted out of the failure to silence it.

This does not change what Linux does today — it was already fourteen red tests. It changes what the
redness says. Before, it read as fourteen regressions; now it reads as one unrecorded platform.

**What identifies a platform: `process.platform`**, and it is deliberately coarser than the thing
that actually varies. The divergence is font rasterization, so two Linux images with different font
stacks would both answer `linux` and one would be trusted further than it has been measured. Nothing
today produces that second image — the render suite runs on the Windows host, and the container's own
render is green and does not run these tests — so a finer key would be unevidenced precision. The
limitation is written at the type rather than left to be rediscovered.

**The twenty-six relational assertions are untouched**, verified rather than asserted: they compare
two renders to each other, they are true on every platform, and they still call `expect` directly.
The module's own doc says so and says why, because routing them through a platform lookup would
state something false about them. The three `toEqual` comparisons in `safe-area` and
`occupies-regions` were checked and left: they compare region hashes against another render's, not
against a literal.

**The seam has its own test**, `packages/video/tests/still-hashes.test.ts`, in the default suite
rather than the render suite — it opens no browser, and `vitest.config.ts` already makes this
argument for the stress generator. Eight cases, and the one that earns the file is the unrecorded
platform, which is exactly the case the render suite cannot reach from a Windows host. Without it
the rule this ticket exists to enforce would have shipped untested. One case pins the other
direction: a moved frame on a recorded platform still fails, so the scoping bought honesty without
buying a blind spot.

**Ticket 09's claim is narrowed in its own words** — *unchanged for the platform that recorded them*
— written into its criterion rather than left to be re-derived.

## Still open

**Recording a Linux set is not done, and it is not assigned.** The user chose seam-only on
2026-09-06 to keep the run-up to the 9th clear, which is the right call: this blocks no deployment,
and the container's service render is green without these tests. But naming an owner was this
ticket's work and the owner is still unnamed, which is the shape a fifth deferral would take. It is
recorded here as unassigned rather than quietly carried, and it needs a decision from the user, not
from a session.

Recording it means rendering these frames on the target image and reviewing each still against the
acceptance prose beside it — a person's work, not a suite run. Spike 11's finding 2 would move the
set again if self-hosting the four faces is ever taken; a platform-scoped design survives that and a
re-accepted Linux canon would not.
