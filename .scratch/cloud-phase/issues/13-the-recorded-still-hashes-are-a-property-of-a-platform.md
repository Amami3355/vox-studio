# 13: The recorded still hashes are a property of a platform, not of a render

Status: ready-for-agent
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
