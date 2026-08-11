# ADR-0001 — Project scaffold

**Status:** accepted · 2026-08-11
**Scope:** repository shape, toolchain, and the parts of the frozen architecture that
had to be made concrete before any code could exist.

## Context

`vox-studio-architecture-figee.md` fixes the architecture but not the toolchain, and
leaves a handful of implementation choices open. This ADR records the ones that were
decided deliberately, so a later reader can tell a decision from an accident.

## Decisions

**Monorepo, pnpm workspaces, no build step.** `packages/video` holds the design system,
primitives, scenes and catalog in one package, consumed as TypeScript source. Splitting
design tokens, primitives and scenes into separate packages is the right structure for a
stable system; these three change together on every visual iteration, and a rebuild
inside that loop is the one cost worth avoiding. `apps/component-studio` is a separate
app because it consumes the library rather than being part of it.

**Polyglot boundary reserved, not built.** The agent orchestration will be Python + ADK
under `services/agents/`. It talks to the library through the manifest and the four
tools — both already JSON. Nothing in the TypeScript assumes a shared runtime.

**Zod 4 with native `z.toJSONSchema()`.** The frozen doc writes
`zodToJsonSchema(schema, { target: "openApi3" })`, which implies Zod 3. Zod 4 does it
natively and validates faster. The manifest targets `openapi-3.0` with `io: 'input'`,
because its only consumer is Gemini function declarations and the agent authors input —
fields carrying defaults must read as optional. Zod itself remains the truth on the
TypeScript side.

**The manifest is committed.** `catalog.json` is generated, never hand-edited, and
checked into git. Two reasons: the Python side must read the catalog without running a
TypeScript build, and the diff of the manifest is the only place where "here is what the
agent now perceives that it did not yesterday" is literally visible. CI fails on drift.

**`searchScenes` returns the whole index.** No filtering, no embeddings. With 8–12
capabilities the compact index costs a few hundred tokens, so a cutoff could only add a
failure mode — the right scene scored out — to save context that does not need saving.
`intent` orders the results, because reading order biases the model's pick.

**Events fold to state plus a change frame.** `resolveEvents` returns, per field, the
value *and* the frame it last changed. A fold that returns only the value cannot animate:
a spring needs to know when to start. Fields with per-item timing (a staggered reveal)
write frames into the state instead, since one `since` cannot describe a batch where
bar 0 appeared seventy frames before bars 1..n.

**One Remotion composition per example.** Not per layout × profile — that is 54
compositions for one capability and an unusable selector by the third. Layout and
profile are props, editable in the props panel; the full matrix is the grid app's job.

**Biome over ESLint + Prettier.** One binary. The main loss is
`eslint-plugin-react-hooks`, whose value is near zero in a codebase where `useState` is
forbidden by rule 4. Revisit if the product Studio UI grows real state.

**MIT licence.** Convention for the hackathon; no discussion cost.

**Vitest on the deterministic core only.** Schemas, event folding, anchor resolution,
aggregation, and the catalog contract. Image snapshots are deferred: on a scene whose
design will change twenty times this week they produce twenty legitimate failures and
zero information. They become worthwhile the moment tokens start changing — that is,
after the second capability.

## Deviations from the frozen document

Recorded in `docs/proposals/architecture-evolutions.md` rather than by editing the
frozen doc, per its own §0.

## Consequences

- Adding a capability means one entry in `src/scenes/registry.ts`; the manifest, the
  Remotion compositions, the grid app and the contract tests all follow automatically.
- `catalog.json` must be regenerated in the same commit as any scene change, or CI fails.
- The library cannot be published to npm as-is (source exports, no build). That is fine
  while it is internal, and is the thing to revisit if it ever ships separately.
