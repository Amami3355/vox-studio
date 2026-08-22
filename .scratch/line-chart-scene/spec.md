# Spec — the `line_chart` SceneCapability

Status: ready-for-agent

## Problem Statement

Vox Studio can compare discrete categories with `bar_chart`, but it cannot show how a value
changes continuously over time. The catalog already redirects that editorial intent to
`line_chart`, yet no such SceneCapability exists. A code-blind Visual Planner therefore receives
guidance toward an unavailable capability and must either misuse bars, flatten the story into a
single statistic, or invent an unknown capability that compilation rejects.

Adding a line chart is also the first concrete test of ADR-0014. Repeating axes, paths, labels,
focus states and SVG geometry by hand would slow every later data capability. Importing a complete
charting system directly into a SceneCapability would instead introduce a second layout and timing
model, weakening deterministic Remotion rendering and leaking third-party vocabulary through the
Primitive seam.

The missing capability must make temporal trends legible in a narrated video, remain truthful
about time and value scales, degrade visibly at its useful limits, compose through the existing
catalog and compiler contracts, and prove that low-level visualization tooling can accelerate Vox
without taking ownership of its design system or clock.

## Solution

Add a `line_chart` SceneCapability for one to three numeric series observed at shared, ordered
calendar dates. A SceneInstance supplies a title, a shared list of dated points, aligned series
values, a unit, a closed baseline policy, and an optional initial focus. The capability draws one
straight-segment temporal plot with visible axes, sparse non-overlapping labels, deterministic
theme-derived series colours, and an explicit empty state.

Add a deep `LinePlot` Primitive as the only visual-library seam. It receives explicit dimensions,
validated data, semantic focus/annotation state and frame-derived reveal progress; it hides scale,
tick, path, marker, legend and label geometry. Its implementation uses the existing `d3-scale` for
pure UTC/value arithmetic and adds only `@visx/shape` for reusable React/SVG line geometry. Visx
does not escape the Primitive interface and owns no animation.

The first version has one `standard` layout and supports only the full composition. It provides
semantic actions to delay the trend reveal, focus a series, focus a dated point, and annotate a
point. All animated state is folded from resolved events and rendered as a pure function of the
current Remotion frame. No data point is aggregated, dropped, smoothed or reordered silently.

The feature is complete when a code-blind Visual Planner can discover and author the capability
from the generated catalog, invalid temporal or referential shapes fail with actionable repairs,
all normative examples and schema ceilings render coherently, the dependency seam mandated by
ADR-0014 is enforced, and the catalog, unit, render, stress, purity and type gates pass.

## User Stories

1. As a viewer, I want to see a value evolve from one date to another, so that I can understand direction rather than compare unrelated snapshots.
2. As a viewer, I want dates placed proportionally in time, so that a six-month gap does not look identical to a one-month gap.
3. As a viewer, I want the value axis to show readable round numbers, so that the line communicates quantity as well as shape.
4. As a viewer, I want the time axis to retain its first and last labels, so that I know the period covered by the trend.
5. As a viewer, I want crowded intermediate date labels thinned predictably, so that the chart remains readable without changing its data.
6. As a viewer, I want all series to share one value axis, so that their relative movement remains comparable.
7. As a viewer, I want a zero-based scale by default, so that an ordinary fluctuation is not exaggerated accidentally.
8. As a viewer, I want a clearly labelled focused-range option, so that small but meaningful changes such as temperature or rates can still be seen.
9. As a viewer, I want a focused series to come forward while other series recede, so that narration and picture agree about which trend matters.
10. As a viewer, I want a focused point to show its date and value, so that the exact narrated moment is identifiable.
11. As a viewer, I want an annotation connected to the point it explains, so that commentary does not float ambiguously over the chart.
12. As a viewer, I want negative and mixed-sign values to cross a visible zero line correctly, so that direction is not visually falsified.
13. As a viewer, I want constant values to produce a stable, non-degenerate axis, so that a flat trend remains visible.
14. As a viewer, I want missing content to render a designed empty state rather than a blank or broken SVG.
15. As a viewer, I want the line to draw from earlier to later dates, so that its entrance reinforces the meaning of elapsed time.
16. As a viewer, I want straight segments between observations, so that the chart does not imply unobserved curved behaviour.
17. As a Visual Planner, I want `line_chart` discoverable for continuous change over time, so that I do not misuse `bar_chart`.
18. As a Visual Planner, I want explicit redirections away from `line_chart` for discrete categories, one number, shares of a whole, dated events and correlations, so that I choose the correct capability.
19. As a Visual Planner, I want the capability schema to use dates, display labels and values rather than SVG coordinates, so that I author meaning rather than geometry.
20. As a Visual Planner, I want one ordered point list shared by every series, so that temporal alignment is unambiguous.
21. As a Visual Planner, I want series values aligned by point order, so that the JSON remains compact enough to author and inspect.
22. As a Visual Planner, I want invalid value counts to identify the offending series and expected count, so that I can repair the plan directly.
23. As a Visual Planner, I want duplicated dates, point labels and series labels rejected, so that later actions have exactly one target.
24. As a Visual Planner, I want dates required in a deterministic calendar format, so that the same plan has the same geometry on every renderer.
25. As a Visual Planner, I want out-of-order dates rejected rather than silently sorted, so that written order remains binding and mistakes stay visible.
26. As a Visual Planner, I want a closed baseline vocabulary instead of arbitrary numeric domains, so that I cannot manufacture a misleading scale accidentally.
27. As a Visual Planner, I want a published recommended point range, so that I know how much temporal detail survives comfortably in a narrated shot.
28. As a Visual Planner, I want a published recommended series range, so that I avoid turning one shot into an unreadable dashboard.
29. As a Visual Planner, I want data beyond the recommended point count to remain present while labels and ordinary markers thin out, so that degradation does not rewrite the trend.
30. As a Visual Planner, I want data beyond the hard ceiling rejected, so that Vox never downsamples or drops observations without saying so.
31. As a Visual Planner, I want canonical, comparison, driven, edge and empty examples, so that I can imitate every important authoring shape.
32. As a Visual Planner, I want one layout in the first version, so that every published choice represents a visually reviewed composition.
33. As a Visual Planner, I want `focusSeries` to name a spoken series label, so that its event can land on the word the narrator uses.
34. As a Visual Planner, I want `focusPoint` to name a spoken point label, so that the visual point lands when that date or period is spoken.
35. As a Visual Planner, I want `annotatePoint` timing to follow the sentence that justifies the note, so that annotation copy is not forced into a deictic word anchor.
36. As a Visual Planner, I want unknown actions and unknown targets rejected loudly, so that a valid render can never hide an animation that did nothing.
37. As a Narrative Agent, I want to delay the first line reveal until the narration introduces the evidence, so that the frame can establish its title before presenting data.
38. As a Narrative Agent, I want to move focus from a whole series to one point, so that the visual argument can narrow with the spoken argument.
39. As a Narrative Agent, I want later focus events to replace earlier focus deterministically, so that emphasis never accumulates into clutter.
40. As a Narrative Agent, I want an annotation to remain attached after it appears, so that the viewer has time to read it before the SceneInstance ends.
41. As a motion designer, I want axes and chrome to use existing theme, spacing and type tokens, so that the new capability belongs to Vox rather than to a third-party chart theme.
42. As a motion designer, I want line colours assigned deterministically from the theme's data-series ramp, so that series identity stays stable across frames.
43. As a motion designer, I want all entrances and emphasis transitions driven by existing motion profiles, so that the new capability introduces no private easing or duration vocabulary.
44. As a motion designer, I want the plot to receive its actual box dimensions before drawing, so that it does not depend on responsive browser measurement.
45. As a motion designer, I want title, legend, plot and annotation geometry owned by the layout and Primitive, so that the agent cannot tune arbitrary margins or coordinates.
46. As a motion designer, I want the full schema ceiling inspected across every motion profile, so that camera movement cannot expose clipping hidden by a static preview.
47. As a catalog maintainer, I want the capability registered once, so that the manifest, tools, Remotion examples and Component Studio derive from the existing registry.
48. As a catalog maintainer, I want every selection hint, constraint, action, layout and example generated into the public catalog, so that a code-blind agent has the full authoring contract.
49. As a catalog maintainer, I want `bar_chart` and `line_chart` to redirect to each other for their distinct intents, so that selection guidance is symmetrical and available before schema inspection.
50. As a compiler maintainer, I want referential checks to run before recording, so that unknown series or point targets fail before any production cost is incurred.
51. As a compiler maintainer, I want an event targeting plot content before a declared reveal rejected in written order, so that a plan cannot validate and animate nothing.
52. As a compiler maintainer, I want the capability to omit composition-capacity metadata, so that the generic compiler does not assume line observations can be collapsed like bars.
53. As a maintainer, I want D3 and Visx hidden behind internal modules, so that SceneCapabilities remain understandable without learning external-library interfaces.
54. As a maintainer, I want Visx to render static geometry only, so that Remotion remains the sole source of time.
55. As a maintainer, I want one focused Visx package rather than a complete chart suite, so that dependency cost tracks demonstrated use.
56. As a maintainer, I want pure scale logic testable without rendering, so that temporal and numeric edge cases fail quickly and explainably.
57. As a maintainer, I want render tests to observe pixels and public SceneInstance behaviour rather than Visx internals or JSX structure, so that library refactors do not rewrite the specification.
58. As a maintainer, I want the import seam enforced automatically, so that a later scene cannot bypass Vox Primitives accidentally.
59. As a maintainer, I want repeated renders of the same frame to be identical, so that distributed Remotion rendering remains reproducible.
60. As a maintainer, I want generated catalog and production contracts committed with the capability, so that no consumer sees a stale registry.
61. As a future capability author, I want a proven `LinePlot` Primitive, so that later temporal data scenes reuse axis, label and focus behaviour instead of rebuilding it.
62. As a future capability author, I want generalisation to a Cartesian plotting system deferred until a second consumer exists, so that the first implementation does not expose a speculative interface.

## Implementation Decisions

- The new capability identifier is `line_chart`, its component name is `LineChartScene`, and
  its family is `data`. Its selection metadata defines it as continuous numeric change over
  calendar time, not merely “data with connected marks.”
- `useWhen` covers a trend, acceleration or slowdown, change over a period, comparison of a
  small number of temporal series, and calling out a dated high, low or inflection.
- `avoidWhen` redirects discrete category comparison to `bar_chart`, a single number to
  `stat_counter`, shares of a whole to `stat_donut`, a sequence of dated events without a
  numeric measure to `timeline`, and correlation between two numeric variables to a future
  scatter capability.
- Agent-authored props contain `title`, `points`, `series`, `unit`, `baseline` and optional
  `focus`. No prop exposes colours, stroke widths, interpolation curves, domains, ticks,
  coordinates, margins, animation durations or pixel dimensions.
- `points` is the shared x-axis and contains objects with a strict `YYYY-MM-DD` calendar date
  and a concise authored display label. Dates are interpreted at UTC midnight. Display labels
  are never generated with locale-sensitive date formatting.
- Point order is authored order and is binding. Dates must be strictly increasing; the
  implementation never sorts them. Dates and display labels must each be unique because actions
  use the display label as their human-readable target.
- `series` contains objects with a unique concise label and a numeric `values` array. The value
  at index N belongs to the point at index N. Every non-empty series must have exactly the same
  number of values as `points`; failures identify the series, actual count and expected count.
- The empty shape is exactly `points: []` with `series: []`. It renders an `EmptyState` carrying
  the title and emits the existing empty soft-constraint warning. A half-filled shape—points
  without series, series without points, or a non-empty series with no values—is a hard,
  actionable validation error rather than an ambiguous empty state.
- The hard ceilings are 36 points and three series. The recommended band is 3–16 points and one
  or two series. One point remains renderable as a dated dot and emits a warning; two points form
  the smallest useful line. A third series remains valid but emits a density warning.
- From 17 through 36 points, every observation and line segment remains on screen. The Primitive
  deterministically thins ordinary point markers and intermediate x-axis labels while retaining
  the first label, last label, focused point, annotated point and complete line geometry. This
  degradation is described in the published constraints and emits a warning.
- More than 36 points or three series is rejected. The first version does not aggregate,
  downsample, average, smooth, omit or combine authored observations. Such transformations could
  change the editorial claim and require a separate explicit decision.
- Values must be finite numbers. All series share one y-axis and one unit. Dual axes and
  per-series units are invalid concepts for this capability rather than hidden layout options.
- `unit` uses the existing value formatter and has the same concise hard ceiling as other data
  capabilities. Axis ticks, focused values and annotation values agree on formatting.
- `baseline` is a closed `zero | extent` vocabulary and defaults to `zero`. `zero` includes zero
  in the y-domain. `extent` uses the observed minimum and maximum plus deterministic headroom;
  it exists for measures where a zero baseline would erase meaningful variation. Both modes draw
  visible numeric ticks, and neither accepts an agent-authored numeric domain.
- A pure `trendAxis` module owns the y-domain, headroom, nice ticks, zero position and value ratio.
  It uses `d3-scale` arithmetic and handles positive-only, negative-only, mixed-sign, constant and
  all-zero inputs without a zero span.
- A pure UTC time-axis module validates parsed dates, maps unequal date intervals to unequal x
  distances, and returns positions plus candidate tick indices. Tick text remains the authored
  point label, so the module performs no locale-dependent formatting.
- The capability provides one `standard` layout: title and optional legend above a single
  Cartesian plot, with annotations contained in the plot. A second arrangement is deferred until
  a real brief demonstrates a distinct reading order.
- The capability declares only the `full` supported composition in this increment. It does not
  claim `left` or `right` until a composed form is designed, rendered and measured. Its occupied
  regions are declared conservatively and held to the existing pixel-based occupation sweep at
  the schema ceiling.
- Composition-capacity metadata is absent. Series and point ceilings are hard semantic limits;
  the compiler must never apply bar-style “Others” aggregation to a temporal line.
- The component follows the common `Backdrop` → `CameraRig` → `SlotFrame` structure, renders the
  title through existing typography Primitives, and delegates all plot geometry to `LinePlot`.
- `LinePlot` is a deep Primitive with a small semantic interface: explicit width and height,
  points, series, unit, baseline, frame-derived reveal progress, current focus and current
  annotation. It does not receive SceneInstances, semantic events, safe-area slots or catalog
  metadata.
- `LinePlot` owns axes, gridlines, path geometry, markers, legend, label thinning, focus styling,
  annotation attachment and collision-safe plot padding. It consumes the Vox theme and density
  contexts rather than accepting a third-party theme.
- Add only `@visx/shape` from Visx v4 for the first implementation. Continue using the existing
  `d3-scale`; do not add Visx scale, group, curve, tooltip or animation packages unless the
  implementation proves a requirement this spec names and the smaller dependency cannot meet.
- Visx is imported only by the Primitive implementation. No capability, schema, action, layout,
  metadata, example or public catalog output imports or names Visx or D3.
- Lines use straight SVG segments between observed points. No smoothing curve is applied because
  smoothing implies values between observations that the plan did not provide.
- The reveal is a left-to-right SVG clip driven by Remotion frame progress. Multiple series use a
  deterministic profile-derived stagger. Axis and legend entrances also derive from the frame;
  no CSS animation, transition, timer, internal Visx animation or `requestAnimationFrame` is used.
- Ordinary point markers appear as the reveal reaches their x-position. Focused and annotated
  markers remain visible after reveal. The plot never uses hover, pointer position or tooltip
  state to expose information required by the video.
- Series colours are assigned by authored series order from the existing theme data-series ramp.
  A focus keeps the target at full emphasis and moves non-target series toward the theme's muted
  ink without changing series identity.
- Optional initial `focus` names a series label and optionally a point display label. A point
  focus always belongs to a named series. Unknown or ambiguous references are rejected before
  render.
- The closed action vocabulary is `revealTrend`, `focusSeries`, `focusPoint` and `annotatePoint`.
  There is no generic “set style,” “set domain,” “animate” or “show tooltip” action.
- `revealTrend` has no payload. Without that action, the trend begins its entrance at scene frame
  zero. When the action exists, plot marks are held back until its resolved frame; title and chart
  frame may establish before the data arrives.
- `focusSeries` names the series label in a deictic `series` field. It brings that line and its
  legend entry forward and clears any earlier point focus.
- `focusPoint` names a series and a deictic point `label`. It brings the series forward, reveals a
  marker, guide and formatted value at that observation, and replaces any earlier focus.
- `annotatePoint` names a series, point label and concise annotation text. Its fields are
  referential but not deictic: timing follows the sentence that justifies the note. A later
  annotation replaces the earlier one so the plot cannot accumulate callouts indefinitely.
- Capability checks reject unknown series, unknown points, duplicated targets, misaligned series,
  non-increasing dates and focus/annotation events written before a declared `revealTrend`. Checks
  remain quiet for the canonical empty shape.
- The event reducer stores reveal, focus and annotation state together with the frame at which each
  change landed. It never uses React state. Folding the same events at the same frame produces the
  same output regardless of render order.
- Minimum and recommended durations are measured from the completed entrance, focus and annotation
  behaviours rather than copied from `bar_chart`. The metadata and examples are updated with the
  measured values before registration.
- Publish at least five normative examples: a canonical single trend, a two-series comparison, a
  driven reveal/annotation that differs from the canonical example primarily through events, an
  edge case exercising the useful density boundary, and the canonical empty shape. “Edge” and
  “empty” appear in titles or notes as required by the catalog contract.
- Deictic focus actions are not forced into capability examples because those examples have no
  recorded word timings. They may be shown in an existing structural plan example only if that
  example has a genuine teaching reason; their omission is legal under ADR-0012.
- Register the capability once and regenerate the catalog and production projections. Adding the
  capability changes catalog content, not the manifest schema, so it does not by itself require a
  manifest-version increment.
- ADR-0014 must land before or with this implementation. The capability-folder shape does not
  change, so the capability procedure document changes only if implementation discovers that one
  of its recorded steps or gates is no longer true.

## Testing Decisions

- Tests prefer the highest existing seam. The principal seam is a registered SceneCapability
  exercised through catalog generation, scene validation, compilation and generic rendering. A
  test should describe what a Visual Planner, compiler or viewer can observe, not the internal
  Visx element tree.
- The shared catalog contract is prior art for completeness. Registration must automatically prove
  the identifier, metadata, strict schema, constraints, closed actions, one valid layout, example
  count, “edge”/“empty” teaching cases and generated JSON-schema compatibility.
- Catalog-tool tests verify that searching for temporal trend intent returns `line_chart`, that its
  full spec publishes the data shape and action vocabulary, and that the existing `bar_chart`
  redirection no longer points to an unavailable identifier.
- Schema and validation tests cover canonical one-series and comparison inputs; strict rejection of
  unknown props; invalid dates; impossible calendar dates; duplicate dates, point labels and series
  labels; non-increasing dates; non-finite values; misaligned value counts; half-empty shapes; hard
  point/series ceilings; invalid baseline; invalid initial focus; and a valid canonical empty shape.
- Soft-constraint tests cover zero points, one point, more than 16 points, and three series. They
  assert warning codes and actionable messages while confirming that valid degraded instances still
  compile.
- Pure axis tests use the returned axis interfaces rather than D3 internals. Y-axis cases cover
  positive-only, negative-only, mixed-sign, constant, all-zero, zero and extent baselines, headroom,
  round ticks and ratios. UTC-axis cases cover equal and irregular intervals, leap days, strict
  ordering, stable positions across time zones, and retention of first/last tick candidates.
- Capability-check tests cover every action against known and unknown series/points, static focus
  references, focus replacement, annotation replacement, absent reveal, and each plot-targeting
  action before and after an authored reveal. Error messages name the field, failed target and valid
  expected labels.
- Compiler tests resolve reveal and focus anchors against a real Take where deictic fields require
  word timing. They verify that the closed vocabulary, Deictic-field rule and event-order rule apply
  without a line-chart-specific compiler branch.
- Primitive render tests observe output at the rendered-frame seam. They verify that the line grows
  left to right, irregular dates receive unequal x spacing, a focused point exposes its value, a
  non-target series recedes, an annotation remains attached, negative values cross zero, and the
  same input/frame renders identically twice.
- Render tests do not assert Visx component names, SVG nesting, helper calls or private coordinates.
  Pixel containment, visible state, stable frame hashes and semantic accessibility of rendered text
  are acceptable observations.
- At least one accepted canonical key frame is inspected by a human before its hash becomes a
  baseline. The accepted test explains what the frame contains and why any later hash change is
  intentional.
- The existing safe-area suite is prior art for composition truth. It automatically exercises the
  declared full composition under the bounding camera profiles and confirms that ink remains inside
  the provided rectangle with a quiet inner border.
- The existing occupied-region suite is prior art for metadata truth. A schema-ceiling control or
  equivalent generated stress instance measures the narrowest truthful occupation claim across all
  motion profiles rather than accepting `full` as an unfalsifiable default.
- The generic stress suite renders zero, minimum, recommended, degraded and hard-ceiling shapes for
  all layouts, supported compositions and motion profiles. It includes long title/labels, 36 points,
  three series, large and negative values, constant values, mixed signs, initial focus and late
  annotation.
- Render-purity coverage must include the new SceneCapability and Primitive. Static enforcement
  rejects React state, wall-clock access, unseeded randomness, CSS animations/transitions and direct
  third-party timing controllers in the drawn surface.
- Add an architecture contract that permits `@visx/*` imports only behind the Primitive seam and
  `d3-*` imports only in pure core arithmetic or Primitive implementation. This holds ADR-0014
  without coupling tests to a specific JSX representation.
- Catalog projection tests confirm that both public and production contracts are regenerated and
  byte-current. No generated artifact is edited manually.
- Visual review in the Component Studio covers all normative examples across every motion profile,
  with special attention to title hierarchy, axis legibility, line distinction, label collisions,
  annotation placement, empty state and the last frame of camera movement.
- Completion runs the capability procedure's full gates: catalog drift check, workspace typecheck,
  deterministic unit suite, render suite, stress suite and Biome check. Compare test counts and
  inspect any baseline failure rather than treating an exit code alone as evidence.

## Out of Scope

- Rewriting or migrating `BarChartScene`, its `BarGroup`, its capacity declarations, or its existing
  axis behaviour.
- A generic Cartesian-chart framework shared by bars and lines. Generalisation waits for a second
  demonstrated consumer of the proposed interface.
- Area charts, stacked areas, streamgraphs, sparklines, step charts, candlesticks, confidence bands,
  scatter plots, regression lines, histograms, forecasts or mixed bar-line compositions.
- Smoothed interpolation curves. The first version uses straight segments between observations.
- Missing values, gaps inside one series, ragged series, per-series calendars or automatic
  interpolation of absent observations.
- More than three series or 36 points, automatic sampling, aggregation, “Others,” smoothing,
  averaging or server-side data preparation.
- Dual y-axes, logarithmic scales, arbitrary authored domains, per-series units, normalized indices
  or percentage-change transforms.
- Intraday timestamps, time zones, locale-generated date labels or automatic date parsing beyond the
  strict UTC calendar-date contract.
- Interactive hover, mouse tracking, tooltips, zooming, brushing, panning, legends that can be
  toggled, responsive browser containers or editor-only controls inside the rendered video.
- `left` or `right` compositions, a callout-column layout, persistent-element coexistence claims, or
  composition-specific point capacity in the first increment.
- New themes, motion profiles, fonts, raw colour props, scene-owned easing values or third-party
  animation systems.
- `@visx/scale`, `@visx/group`, `@visx/curve`, Recharts, Nivo, Victory, Chart.js,
  `@remotion/shapes` or `@remotion/paths` unless a separately recorded need changes this scope.
- Automatic migration of an existing `bar_chart` SceneInstance when a user asks to “put it in a
  line.” Prompt-edit migration remains the separate workflow described by the frozen architecture.
- Implementing transitions between SceneInstances, changing the anchor grammar, or changing the
  compiler's slot-conflict ladder.
- Adding new agent orchestration, production-service operations, asset resolution or product Studio
  UI.

## Further Notes

- This spec implements ADR-0014's first demand-driven Visx adoption. If implementation cannot keep
  Visx static, frame-driven and hidden behind `LinePlot`, the correct response is to remove Visx and
  use React/SVG directly—not to widen the SceneCapability interface.
- The seam chosen for acceptance is the registered SceneCapability because it is the highest place
  where schema, teaching surface, compiler semantics and rendered output meet. Pure axis tests are a
  justified lower seam for dense arithmetic edge cases; `LinePlot` is otherwise verified through the
  SceneCapability render path.
- `LinePlot` is intentionally specific. After another temporal or Cartesian capability needs the
  same behaviour, the two real consumers provide evidence for extracting a deeper shared plotting
  module. Before then, a generic plotting interface would be hypothetical.
- No glossary update is required: `SceneCapability`, `SceneInstance`, `Primitive`, `Action`,
  Deictic field, Safe area, Motion profile, Manifest and Compile report retain their existing
  meanings.
- The implementation must start by reading the capability procedure and ADR-0014. Any discovery
  that changes the capability-folder shape, registration path or required gates updates the
  procedure in the same change, as required by the repository instructions.
