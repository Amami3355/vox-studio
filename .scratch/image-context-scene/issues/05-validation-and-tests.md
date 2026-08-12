# 05 — Validation coverage and the two test suites

Status: ready-for-agent

Capability validation must cover valid canonical input, a missing or malformed
`AssetRequirement`, invalid copy types, hard-limit breaches, an unknown layout, and soft
limits that warn without rejecting.

Covers spec user stories 11–13, 33 and 36.

## Comments

**Partly delivered** in `d34af39`: malformed requirement and soft limits only.

**Completed in review.** Added the missing cases — a non-string headline, copy past the
120-character hard ceiling, an unpublished layout, and a blank asset subject. The last one
needed a schema fix: `subject` had a ceiling but no floor, so `''` validated while being
the visible label of every degraded plate. `identityKey` gained the same floor, since an
empty identity is not a shared identity and would have collided in the resolver's cache.

**Two suites now, not one.** The headless-Chrome render tests moved to
`packages/video/tests/render/` behind `pnpm test:render` and `vitest.render.config.ts`.
They were bundling the project and driving a browser inside the default `pnpm test`,
which is specified as the deterministic core; the default suite is back to ~1s.

The render suite also stopped stating everything as literal hashes. What the spec asked
for — the three asset states render, and placeholder and failed degrade identically — is
now asserted as a *relation* between hashes, which survives a machine whose font
rendering differs. The literal key-frame baseline is a separate test, which is the one
that is supposed to fail when the design changes on purpose.
