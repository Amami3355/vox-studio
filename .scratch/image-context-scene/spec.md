# ImageContextScene and minimal placeholder asset resolution

Status: ready-for-agent

## Problem Statement

Vox Studio currently has only one `SceneCapability`, `bar_chart`. It can validate and
render an isolated data scene, but it cannot yet create the image-led context shots
required by the housing/rent vertical slice. With only one capability, the project also
cannot reach the first meaningful continuity test: two different visual compositions
sharing a `Section` with a persistent element.

The next increment must add a genuinely different `SceneCapability` without consuming
the schedule on a broad asset pipeline or multiple polished layouts. It must keep the
agent-facing plan semantic, produce an immediate renderable placeholder, preserve the
deterministic Remotion runtime, and leave a clean input for the minimal compiler and
`Section` runtime that follow.

## Solution

Add an `image_context` `SceneCapability` for an editorial image paired with concise
context copy. The first version has one `splitLeft` layout, uses the existing design and
motion systems, consumes `safeArea`, and deliberately exposes no scene actions. Its
agent-authored props contain an `AssetRequirement`, never a raw URI or resolved
`AssetRef`.

Add the smallest useful Asset Resolver path alongside it. Resolution checks an
`identityKey` cache, then a repository-controlled local library, then returns an
immediate themed placeholder when no ready asset exists. Resolution is deterministic
and offline. The resulting `AssetRef` travels to the runtime separately from the
semantic props so that the generated manifest remains an authoring contract rather than
leaking runtime asset locations to the Visual Planner.

This increment is complete when the capability is discoverable through the existing
catalog tools, all normative examples validate, placeholder and ready/failed rendering
degrade correctly, the Component Studio can inspect the layout across motion profiles,
and the full project checks remain green.

## User Stories

1. As a viewer, I want an image-led opening shot, so that the explainer establishes its subject before presenting data.
2. As a viewer, I want the image and copy to form one editorial composition, so that the result feels like a designed documentary rather than a slide.
3. As a viewer, I want a meaningful placeholder instead of a blank frame, so that an unresolved image does not interrupt the story.
4. As a viewer, I want failed assets to degrade into a coherent themed treatment, so that the video remains watchable when asset preparation fails.
5. As a Visual Planner, I want to discover `image_context` from an image, documentary-context, or establishing-shot intent, so that I can choose it without reading code.
6. As a Visual Planner, I want explicit `useWhen` guidance, so that I select `image_context` for contextual imagery and image-supported explanations.
7. As a Visual Planner, I want explicit `avoidWhen` redirections, so that I do not misuse `image_context` for charts, maps, typography-only statements, or character-led explanation.
8. As a Visual Planner, I want one canonical layout in this increment, so that I can produce valid SceneInstances without guessing between under-tested variants.
9. As a Visual Planner, I want to provide a semantic `AssetRequirement`, so that I can describe the visual subject without inventing a file path or URI.
10. As a Visual Planner, I want the asset treatment and orientation expressed through closed vocabularies, so that my output remains valid and predictable.
11. As a Visual Planner, I want hard schema failures to explain invalid copy or asset requirements, so that I can repair a SceneInstance before rendering.
12. As a Visual Planner, I want soft limits published in the manifest, so that I know the useful copy lengths before I exceed them.
13. As a Visual Planner, I want normative canonical, edge, and empty examples, so that I can imitate valid SceneInstances reliably.
14. As a Narrative Agent, I want a headline and optional supporting caption, so that a beat can carry both its central claim and minimal visual context.
15. As a video author, I want to change the headline, caption, or visual subject in JSON, so that the rendered shot changes without video-specific code.
16. As a video author, I want the same capability usable for both the opening and closing image beats, so that the vertical slice does not need hand-written section components.
17. As a video author, I want motion chosen through an existing motion profile, so that image movement remains motivated and consistent with the rest of the video.
18. As a motion designer, I want typography, spacing, colour, camera movement, and entrances to come from existing tokens and primitives, so that the second capability shares the visual language of the first.
19. As a motion designer, I want the image crop and split proportion to be defined by the layout rather than exposed as arbitrary agent coordinates, so that compositions remain controlled.
20. As a motion designer, I want the layout to consume compiler-provided `safeArea`, so that it can later coexist with a persistent element without scene-specific collision logic.
21. As a motion designer, I want unresolved and failed assets to use the requirement subject as their visible label, so that the placeholder still communicates editorial intent.
22. As an Asset Resolver consumer, I want a local-library hit to return a `ready` `AssetRef`, so that local assets can replace placeholders without changing the SceneInstance.
23. As an Asset Resolver consumer, I want a local-library miss to return a `placeholder` `AssetRef`, so that preview generation never waits for unavailable media.
24. As an Asset Resolver consumer, I want an unreadable or explicitly failed local asset to return a `failed` `AssetRef`, so that intervention can be distinguished from ordinary waiting.
25. As an Asset Resolver consumer, I want repeated requirements with the same `identityKey` to reuse the same resolution, so that a recurring subject does not change identity across scenes.
26. As an Asset Resolver consumer, I want resolution to be deterministic, so that the same inputs produce the same asset state and preview.
27. As a future compiler implementer, I want semantic requirements and resolved references kept separate, so that compilation can reject a missing reference without teaching an agent to author one.
28. As a future `Section` runtime implementer, I want `ImageContextScene` to use the standard scene runtime contract, so that it can be sequenced alongside `BarChartScene` without an adapter.
29. As a future `Section` runtime implementer, I want the capability metadata to describe its occupied regions and supported compositions accurately, so that slot conflict resolution has useful inputs.
30. As a catalog maintainer, I want the new capability added through the registry, so that the manifest, Remotion examples, tools, and Component Studio derive from the same source.
31. As a catalog maintainer, I want the generated manifest committed with the capability change, so that the Python agent boundary can consume it without executing TypeScript.
32. As a maintainer, I want one schema to drive props validation and the agent-facing catalog, so that documentation and runtime behavior cannot drift.
33. As a maintainer, I want the capability to satisfy the existing catalog contract, so that missing examples, layouts, constraints, or selection metadata fail the build.
34. As a maintainer, I want the scene render to remain a pure function of its runtime inputs and frame, so that Remotion can render frames independently and reproducibly.
35. As a maintainer, I want the resolver to avoid network and cloud dependencies in this increment, so that local development and CI remain credential-free.
36. As a maintainer, I want the full typecheck, unit tests, formatting checks, and catalog drift check to pass, so that the new capability does not destabilize the finished foundation.
37. As a hackathon builder, I want this increment intentionally limited to one layout and one placeholder treatment, so that work can move immediately to the compiler and continuity test.
38. As a hackathon builder, I want this second capability to differ structurally from `BarChartScene`, so that the next increment can expose real transition and slot-collision problems.

## Implementation Decisions

- The capability identifier is `image_context`, its name is `ImageContextScene`, its
  family is `context`, and it declares that it requires assets.
- The increment provides exactly one layout, `splitLeft`. It combines one editorial
  image region with one copy region. The internal split, crop, spacing, and alignment
  are design decisions owned by the layout and are not agent-configurable coordinates.
- `splitLeft` must be designed for the housing/rent vertical slice and for later
  coexistence with a persistent element. Its capability metadata must truthfully
  declare occupied regions and supported compositions so the compiler can reason about
  conflicts in the next step.
- Agent-authored props contain a required headline, an optional concise caption, and a
  required semantic `AssetRequirement`. Copy has a generous hard ceiling and a tighter
  published recommended ceiling; exceeding the recommendation degrades typography and
  emits the existing density/soft-limit warning rather than failing.
- `AssetRequirement` uses the shared closed fields for type, subject, treatment,
  orientation, and optional `identityKey`. The agent never supplies raw colours,
  dimensions, crop coordinates, local paths, network URLs, or resolved asset status.
- Resolved assets do not become authored props and are not published as choices in the
  manifest. The scene runtime contract gains a resolved-assets input keyed by the
  SceneInstance and requirement field. Capabilities without assets receive an empty
  collection, preserving the same generic runtime path.
- The component receives one resolved `AssetRef`. A `ready` reference renders the local
  media with deterministic cover cropping. `placeholder` and `failed` references render
  the same polished theme-derived plate with the requirement subject; their operational
  distinction remains present in the `AssetRef` for the future compile report.
- The placeholder treatment is repository-controlled, immediate, and deterministic.
  It must not require image generation, a browser request, credentials, current time,
  random values, or component state.
- The minimal Asset Resolver follows only three paths: identity cache, local library,
  and placeholder fallback. Identity cache is checked first. The local library is
  checked second. A miss becomes a placeholder rather than an exception.
- Requirements sharing an `identityKey` within one project resolution scope return the
  same resolved reference. The cache is explicit resolver state, not hidden React state
  or process-global rendering state.
- Local asset selection and placeholder identifiers are stable functions of semantic
  inputs. A corrupt or explicitly failed local entry produces `failed`; simple absence
  produces `placeholder`.
- This version exposes no semantic event actions. Entrance and camera behavior come
  entirely from the selected motion profile. Event vocabulary can be added only when a
  demonstrated narrative need justifies it.
- The component uses the existing design system and primitives for backdrop, camera,
  typography, entrance, spacing, and `safeArea`. It introduces no new theme, font,
  easing, duration, raw palette value, or agent-facing positioning option.
- The render remains a pure function of props, resolved assets, the frame, theme,
  profile, duration, and `safeArea`. No `useState`, unseeded randomness, wall clock, or
  asynchronous lookup is allowed in the render path.
- The capability provides at least three normative examples: the canonical housing
  context shot, a long-copy or extreme-orientation edge case, and an empty/unresolved
  asset case. All examples use semantic anchors only if events are ever introduced;
  this version has no events.
- The new capability is registered once. Catalog generation, catalog tools, Remotion
  compositions, and Component Studio discovery continue to derive from the registry.
- The manifest is regenerated and committed with the change. It is never edited by
  hand.
- The frozen architecture document is not edited. Any implementation discovery that
  genuinely contradicts it must be recorded as a proposal or ADR instead of silently
  changing the source of truth.

## Testing Decisions

- Tests assert external contracts rather than internal component structure. They should
  ask whether a SceneInstance is discoverable, valid, resolvable, and renderable, not
  whether a particular helper or JSX tree exists.
- The primary automated seam is the existing registry-to-catalog-to-`validateScene`
  path. A capability added to the registry must automatically pass the shared catalog
  contract, appear in search/spec tools, expose exactly one layout, publish soft
  constraints, and validate all of its examples.
- Capability validation tests cover valid canonical input, missing or malformed
  `AssetRequirement`, invalid copy types or hard-limit breaches, an unknown layout, and
  soft copy limits that warn without rejecting the SceneInstance.
- The Asset Resolver is tested at its public resolution boundary. Tests cover an
  identity-cache hit, a local-library hit returning `ready`, a miss returning
  `placeholder`, an explicit local failure returning `failed`, and deterministic repeat
  resolution.
- A runtime integration test passes a resolved asset through the generic scene renderer
  and confirms that `ready`, `placeholder`, and `failed` states render without throwing.
  The test observes the public render boundary rather than inspecting component
  internals.
- The existing catalog contract tests are the prior art for capability completeness and
  example validity. Existing validation tests are the prior art for hard errors, soft
  warnings, and actionable error messages.
- Existing deterministic Remotion still rendering is the prior art for runtime
  verification. At least one canonical still and the six-frame Component Studio
  filmstrip are reviewed for hierarchy, respiration, timing, typography, palette, crop,
  and placeholder legibility.
- Visual review occurs for every motion profile supported by the common runtime, but
  this increment does not multiply layouts or add a new visual matrix dimension.
- A brittle image snapshot is not required before the first visual iteration is
  accepted. Once accepted, a stable key-frame hash may be recorded as the
  non-regression baseline now that the catalog contains a second capability.
- Completion requires the repository-wide typecheck, all deterministic tests, Biome
  check, and catalog drift check to pass. The working tree must contain the regenerated
  manifest and no accidental rendered output.

## Out of Scope

- Additional `ImageContextScene` layouts such as full bleed, cutout-on-colour,
  image-with-stat, annotated image, or evidence composition.
- A scene-specific action vocabulary, annotation events, statistics, quotes, or
  character rendering inside the capability.
- The generic `Section` runtime, persistent-layer rendering, transitions, slot conflict
  resolution, `safeArea` compilation, and the continuity test itself.
- The minimal compiler, beat-to-frame compilation, absolute event timings, and compiled
  video document.
- Google Cloud TTS, SSML timepoint verification, `packages/voice`, word-onset snapping,
  and the beat compiler.
- Network image search, licensed providers, Gemini image generation, image editing,
  cutout, duotone processing, project cache, or sophisticated subject matching.
- Agent orchestration, Google ADK/Agent Builder, Parallel integration, product Studio UI,
  prompt editing, export, hosting, and the complete hackathon workflow.
- Multiple themes, new motion profiles, broad primitive refactors, or further
  `BarChartScene` polish.
- Deciding the compiler algorithm for `SLOT_RELOCATED` and
  `PERSISTENT_ELEMENT_HIDDEN`; that decision belongs immediately before the Section
  runtime/compiler increment.

## Further Notes

- This spec implements build-order step 5 only. The next deliverable is the generic
  `Section` runtime plus minimal compiler, followed immediately by a continuity test
  using `ImageContextScene`, `BarChartScene`, and one persistent element.
- The implementation starts from a clean `master`: typecheck passes, 97 tests pass,
  Biome is clean on 59 files, and the catalog is synchronized.
- The time pipeline is already decided by ADR-0002 and must not be reopened here.
  Before implementing `packages/voice`, verify empirically that Google Cloud TTS returns
  a timepoint for a trailing SSML mark at the end of speech.
- Precision on a spoken word is still obtained by splitting beats at that word boundary;
  arithmetic `.mid` and offset anchors are not word-synchronized.
- The frozen architecture remains the primary source of truth. This spec deliberately
  cuts breadth, not contracts: semantic authoring, deterministic rendering, loud hard
  failures, silent degradation, and manifest-driven discovery all remain mandatory.
