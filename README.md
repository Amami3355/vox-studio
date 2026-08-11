# Vox Studio

An autonomous AI production crew for visual explainers. Give it a question; its agents
research the web, build a sourced narrative, direct the visual story, generate the
assets, synchronise everything to voice-over, and compile the result into an editable
motion-designed documentary.

Instead of generating disconnected AI clips, Vox Studio produces a **structured video
document** — agentic reasoning, factual research, generative media and deterministic
Remotion rendering.

Built for [Agentic Cinema: The Blockbuster Hackathon](https://agentic-cinema.devpost.com/)
· Partner track: Parallel.

---

## Status

Early. What exists today is the foundation of the scene library — steps 1–4 of the build
order in `vox-studio-architecture-figee.md` §13:

- **L0 design system** — one theme (`editorial-cold`), six motion profiles, type and
  spacing scales, fonts.
- **L1 primitives** — `SlotFrame`, `CameraRig`, `AnimatedText`, `Bar`, `Callout`,
  `EmptyState`, `Backdrop`. Not exposed to the agent.
- **L2 — `BarChartScene`**, the pattern every other capability will copy: hard schema,
  soft constraints, closed action vocabulary, three layouts, five examples.
- **Catalog + the four tools** — generated manifest, `searchScenes`, `getSceneSpec`,
  `validateScene`, `validateVideoPlan`.
- **Component Studio** — grid, six-frame filmstrip and layout × motion-profile matrix.

Not built yet: beat compiler, TTS timepoints, Section runtime, Asset Resolver, the
remaining capabilities, the agents, the product Studio UI.

## Getting started

Requires Node 20+ and pnpm 9.

```bash
pnpm install
pnpm catalog          # generate the scene manifest
pnpm studio           # Remotion Studio — one composition per catalog example
pnpm grid             # Component Studio — the evaluation harness, localhost:5273
```

Checks:

```bash
pnpm typecheck
pnpm test             # deterministic core: schemas, event folding, anchors, aggregation
pnpm check            # Biome
pnpm catalog:check    # fails if the manifest has drifted from the registry
```

Render a frame to look at:

```bash
cd packages/video
pnpm still bar-chart--example-rent-burden out/frame.png --frame=190
```

## Repository

```
packages/video/           the scene library — everything Remotion renders
  src/design/             L0 tokens
  src/primitives/         L1, never exposed to the agent
  src/scenes/             L2, the catalog; one folder per capability
  src/catalog/            manifest generation, the four tools, validation
  src/runtime/            scene rendering and example playback
apps/component-studio/    internal evaluation harness
services/agents/          reserved for the Python ADK orchestration
```

Start with [`CONTEXT.md`](./CONTEXT.md) for the vocabulary and the six rules,
[`docs/adr/`](./docs/adr) for why the scaffold looks like this, and
[`vox-studio-architecture-figee.md`](./vox-studio-architecture-figee.md) for the frozen
architecture.

## Adding a capability

One entry in `packages/video/src/scenes/registry.ts`. The manifest, the Remotion
compositions, the Component Studio and the contract tests all follow from it. The
contract tests in `tests/catalog-contract.test.ts` enforce the catalog checklist, so a
capability missing its edge case or its `avoidWhen` redirections fails the build.

Regenerate `catalog.json` in the same commit — CI fails on drift.

## Licence

MIT. Note that [Remotion](https://remotion.dev) has its own licence: free for
individuals and companies under four people, paid beyond that.
