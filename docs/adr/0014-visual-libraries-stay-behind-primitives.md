# ADR-0014 — Visual libraries stay behind primitives

**Status:** accepted · 2026-08-21 · adoption is demand-driven
**Scope:** how third-party drawing and charting libraries may participate in a Primitive or
SceneCapability. This decides the dependency seam and timing ownership; it does not select
the next capability or schedule a migration of the existing `BarChartScene`.

## Context

The first chart capability established a useful split: `d3-scale` computes a rounded value
domain and ticks in `core/scale.ts`; Vox Primitives own the DOM, typography, density, safe-area
geometry and degradation; Remotion owns time. The result is deterministic and tailored to an
editorial frame, but hand-authoring every future line, area, pie, scatter, axis and path would
repeat solved geometry and slow capability development.

A complete chart library appears to remove more work. It also brings decisions that conflict
with this render system: responsive containers that discover their size at runtime, interactive
tooltips and legends, library styling, and animations driven by milliseconds or
`requestAnimationFrame`. Remotion requires drawn state to be a pure function of the current
frame; its documentation explicitly warns that animations not driven by `useCurrentFrame()`,
including CSS transitions, can flicker during rendering. Recharts, for example, uses a
`requestAnimationFrame` controller by default and enables animation on its principal chart
marks. Disabling and adapting those behaviours is possible, but making that adaptation part of
every SceneCapability would exchange drawing boilerplate for timing and layout boilerplate.

The alternative is a low-level visualization toolkit. Visx supplies modular React/SVG shapes,
groups, curves, axes and D3-backed geometry without baking in animation. Official Remotion
packages supply deterministic SVG shape and path utilities. Both can accelerate implementation
while leaving Vox in control of the picture.

## Decision

**1. Remotion remains the only clock.** Every animated property drawn by a Primitive or
SceneCapability is derived from the current frame through Vox motion helpers or Remotion
`interpolate()` / `spring()`. A third-party component's internal animation, transition, timer,
randomness or `requestAnimationFrame` controller is disabled or excluded. This extends the
render-purity rule in `CONTEXT.md` and is independent of ADR-0013's decision about transitions
between SceneInstances.

**2. Third-party visualization code stays behind the Primitive seam.** A SceneCapability
imports Vox Primitives, not `d3-*`, `@visx/*`, Recharts or another drawing toolkit. A Primitive
may use those packages as implementation details while presenting a small Vox interface in the
project vocabulary: explicit data, box dimensions, theme-derived appearance and frame-derived
progress. Safe areas, composition density, labels, degradation and editorial defaults remain
Vox responsibilities.

**3. Pure D3 modules remain the default for arithmetic.** Scales, ticks, domains, curves,
stacks, bins and other calculations may use focused `d3-*` packages. D3 does not own the DOM or
animation. The existing `valueAxis()` and `BarChartScene` remain in place; adopting another
toolkit is not a reason to rewrite working geometry.

**4. Visx is the preferred toolkit when reusable SVG geometry earns a dependency.** Adopt it
only for a concrete capability that would otherwise duplicate meaningful shape or axis work,
and install only the focused packages needed, such as `@visx/shape`, `@visx/group` or
`@visx/curve`. Visx is an implementation choice inside a Primitive, not a second public design
system and not part of the catalog interface.

**5. Official Remotion geometry utilities are preferred for general motion graphics.** Use
`@remotion/shapes` for standard SVG shapes and `@remotion/paths` for path measurement,
transformation, drawing and interpolation when a concrete Primitive needs them. All Remotion
packages must use the repository's exact Remotion version.

**6. Layout inputs are explicit.** A visual Primitive receives the `FrameBox` or numeric width
and height already resolved by Vox. It does not depend on `ResizeObserver`, viewport discovery,
an interactive browser event, or a post-layout measurement to decide what a rendered frame
contains. Text continues to use the loaded font and the deterministic layout utilities already
owned by the design system.

## Considered and rejected

**A complete chart library as the SceneCapability foundation** — Recharts, Nivo, Victory or
Chart.js can produce a dashboard chart quickly, but their value comes with an opinionated chart
surface and frequently a separate animation or responsive-layout lifecycle. They remain legal
inside an experiment, with animation disabled and explicit dimensions, but are not the default
foundation for catalog capabilities. Adapting one globally would also make its interface part
of every scene author's knowledge instead of hiding complexity behind Vox Primitives.

**Hand-author every visual with HTML/SVG and D3 arithmetic** — this retains maximum control and
is still appropriate for a unique editorial mark. Making it a rule would repeat path, curve,
axis and shape implementation across capabilities. Low-level reusable geometry buys leverage
without giving away timing or design ownership.

**Expose Visx directly to every SceneCapability** — rejected because it creates a shallow seam:
each scene would need to understand both Visx and the Vox layout, theme, motion and degradation
rules. The Primitive is the deep module: one implementation absorbs those concerns and every
SceneCapability reuses the smaller interface.

## Consequences

- No dependency or existing rendering code changes merely because this ADR is accepted.
- The first concrete capability that needs reusable chart geometry gets its own spec. That spec
  selects the minimum packages, names the Primitive interface, and defines render, stress,
  purity and catalog acceptance tests.
- A candidate library is proven behind one new Primitive before broader adoption. Existing
  Primitives migrate only when the new implementation removes duplicated behaviour or fixes a
  measured limitation.
- A SceneCapability remains understandable to a code-blind author through the generated catalog;
  no third-party vocabulary leaks into schemas, actions, layouts, metadata or examples.
- Shared geometry becomes local to `src/primitives/` (and pure arithmetic to `src/core/`), so a
  fix to axes, labels, density or frame-driven motion benefits every consuming capability.

## What the first adoption actually cost

Recorded here because the `line_chart` spec's *Out of Scope* names `@visx/scale`, `@visx/group`
and `@visx/curve` as packages this decision does not buy — *"unless a separately recorded need
changes this scope"* — and one dependency brought all three anyway.

`packages/video` declares exactly one: `@visx/shape`. The lockfile holds five, because
`@visx/shape` depends on `@visx/curve`, `@visx/group`, `@visx/scale` and `@visx/vendor`. No
source file imports any of the four, and none is a direct dependency, so the *authoring* scope
is what the spec said it was. The install cost is not, and the difference between those two is
worth having written down rather than discovered at the next audit.

Nothing changes as a result. The seam this ADR is about is which module may `import` a
library, not which package manager entry exists — and `tests/render-purity.test.ts` holds the
seam that matters. It now also asserts the declared surface is one package, so a second direct
`@visx/*` dependency is a decision somebody has to take on purpose.

## References

- Remotion, [Animating properties](https://www.remotion.dev/docs/animating-properties)
- Airbnb, [Visx](https://github.com/airbnb/visx)
- Remotion, [`@remotion/shapes`](https://www.remotion.dev/docs/shapes)
- Remotion, [`@remotion/paths`](https://www.remotion.dev/docs/paths)
- Recharts, [Animations](https://recharts.github.io/en-US/guide/animations/)
