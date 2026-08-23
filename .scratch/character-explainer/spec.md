# Spec — the `character_explainer` SceneCapability

Status: ready-for-agent

## Problem Statement

Vox Studio can establish context with an editorial image, state a claim with typography,
quote a person, and explain quantities with charts. It cannot yet build a frame in which a
single recognisable character or figure visually carries an explanation.

The product documentation names `CharacterExplainerScene` for explanation, reaction,
narration and the incarnation of a concept. That intent is currently easy to overread as a
talking avatar, a rigged presenter, or a new owner of section-level persistence. None of those
is required. The desired first increment is a deterministic SceneCapability built around one
resolved 2D character asset: a portrait, illustration or cutout given restrained graphic
motion and paired with concise explanatory copy.

Without this capability, a Visual Planner must misuse `image_context` for a person-led
explanation, flatten the explanation into `typographic_statement`, or treat a character as a
passive persistent overlay that cannot participate in the scene's didactic rhythm. Those
repairs lose the visual register the catalog is missing: *who* carries the explanation.

## Solution

Add a `character_explainer` SceneCapability in the existing `character` family. A
SceneInstance supplies one semantic character requirement, an optional label, headline and
explanation. The Asset Resolver supplies a stable cutout or illustration, and the
scene composes it with the copy in one full-frame side-by-side layout.

The character remains a 2D image. The scene creates the feeling of animation through
deterministic Remotion transforms and graphic effects: entrance, subtle ambient drift and a
short accent gesture such as a restrained scale/tilt pulse with an editorial halo or marks.
It does not animate a mouth, skeleton, limbs or generated sequence of poses.

The first increment has three closed actions:

- `revealCharacter` holds the cutout back and then performs its entrance;
- `revealCopy` holds the label, headline and explanation back and then reveals them in their
  visual hierarchy;
- `accentCharacter` performs a brief, repeatable graphic emphasis and returns the cutout to
  its settled state.

The scene owns its character pixels for its entire duration. Section-level persistent
elements remain a separate mechanism and are not controlled, consumed or replaced by this
capability. Reusing an `identityKey` across requirements reuses the same resolved picture; it
does not promise uninterrupted position or animation across SceneInstances.

The feature is complete when a code-blind Visual Planner can choose and author it from the
generated catalog, all three actions have visible and deterministic effects, the character
and copy remain legible across the accepted content regimes and motion profiles, and the
documented capability gates pass.

## User Stories

1. As a viewer, I want one recognisable character to anchor an explanation, so that the frame has a clear human or conceptual subject.
2. As a viewer, I want the character and the explanation visible in one composition, so that I do not have to infer their relationship across separate shots.
3. As a viewer, I want the cutout to enter with restrained graphic motion, so that the scene feels produced rather than pasted together.
4. As a viewer, I want the character to retain subtle ambient life after its entrance, so that a static asset does not make the frame feel dead.
5. As a viewer, I want an accent gesture to briefly bring the character forward, so that a narrated emphasis is visible as well as audible.
6. As a viewer, I want an accent gesture to return to rest, so that emphasis does not permanently distort the composition.
7. As a viewer, I want repeated accents to remain deterministic, so that rendering the same plan twice produces the same film.
8. As a viewer, I want the copy to enter in a readable hierarchy, so that I encounter the label, claim and explanation in the intended order.
9. As a viewer, I want the character to remain recognisable while it moves, so that motion never crops away the face or identifying silhouette.
10. As a viewer, I want the scene to remain visually coherent with other Vox Studio scenes, so that the character register belongs to the same film.
11. As a viewer, I want a long but valid headline to reduce gracefully, so that no authored text is clipped or silently removed.
12. As a viewer, I want a long but valid explanation to fit or degrade visibly, so that the scene never presents an accidental overflow as a finished frame.
13. As a viewer, I want empty explanatory copy to produce a designed state, so that missing content does not look like a rendering failure.
14. As a viewer, I want a missing or unresolved asset to use the existing honest placeholder behavior, so that the runtime never invents a person.
15. As a viewer, I want the character to stay inside the live frame under every supported motion profile, so that camera allowance does not cut it off.
16. As a Visual Planner, I want `character_explainer` published in the catalog, so that I can select a character-led explanation rather than misuse an image scene.
17. As a Visual Planner, I want the capability classified in the `character` family, so that it appears in the catalog group reserved for this visual kind.
18. As a Visual Planner, I want selection metadata to explain that the character must materially carry the explanation, so that I do not choose it merely because a person appears in an image.
19. As a Visual Planner, I want redirection to `image_context` when the person is only documentary context, so that a contextual photograph does not become a presenter scene.
20. As a Visual Planner, I want redirection to `quote` when the frame's purpose is to attribute exact words, so that quotation and explanation remain distinct editorial jobs.
21. As a Visual Planner, I want redirection to `typographic_statement` when the claim needs no character, so that the catalog does not add a decorative person without a role.
22. As a Visual Planner, I want guidance to use a section-level persistent element when a character must remain over unrelated scene kinds, so that persistence is not simulated by this capability.
23. As a Visual Planner, I want to request the character semantically rather than provide a URI, so that asset resolution stays reproducible and reviewable.
24. As a Visual Planner, I want the asset contract restricted to a character cutout or illustration, so that an unsupported map, document or landscape plate fails before rendering.
25. As a Visual Planner, I want to provide an `identityKey` for a recurring figure, so that repeated requirements resolve to the same visual identity.
26. As a Visual Planner, I want one-off characters to remain legal without an `identityKey`, so that identity sharing is required only when recurrence makes it meaningful.
27. As a Visual Planner, I want concise descriptions on every authored field, so that I can produce a valid SceneInstance without reading implementation code.
28. As a Visual Planner, I want generous hard ceilings and clear recommended bands, so that quality problems warn and genuinely unrenderable plans fail.
29. As a Visual Planner, I want a closed action vocabulary, so that an invented reaction verb fails instead of rendering a silent no-op.
30. As a Visual Planner, I want an eventless instance to animate into its normal settled frame, so that actions are optional rather than required boilerplate.
31. As a Visual Planner, I want `revealCharacter` to take ownership of the character entrance when I declare it, so that the cutout does not enter before the narration reaches it.
32. As a Visual Planner, I want `revealCopy` to take ownership of the copy entrance when I declare it, so that explanatory text can follow the visual subject.
33. As a Visual Planner, I want `accentCharacter` to accept any valid semantic anchor, including a word anchor, so that I can synchronize emphasis with narration.
34. As a Visual Planner, I want `accentCharacter` to have no deictic payload, so that I am not forced to duplicate a spoken word merely to time a visual pulse.
35. As a Visual Planner, I want an accent written before a declared character reveal to be refused with a repair, so that a valid plan cannot animate an element still held back.
36. As a Visual Planner, I want at least three normative examples, including an edge and an empty case, so that I can learn the intended authoring shapes from the catalog.
37. As an editor, I want to change the character subject and explanatory copy through SceneInstance props, so that the scene remains reusable without capability code changes.
38. As an editor, I want the motion profile to change the energy within existing design bounds, so that I can vary pacing without authoring raw animation values.
39. As a maintainer, I want the capability to use the ordinary SceneCapability interface, so that no character-specific runtime branch enters the generic render path.
40. As a maintainer, I want the existing Asset Resolver to remain the sole owner of requirement-to-reference resolution, so that the capability never reads or creates an asset location.
41. As a maintainer, I want the scene to be the sole owner of its cutout pixels, so that no duplicate drawing or implicit handoff can occur with the persistent layer.
42. As a maintainer, I want the event reducer to store entrance and accent frames explicitly, so that untouched and event-driven states cannot be confused.
43. As a maintainer, I want tests to observe catalog, validation and rendered behavior rather than internal reducer fields or transform constants, so that visual implementation can evolve without rewriting contract tests.
44. As a maintainer, I want generic safe-area and content-stress sweeps to include the capability automatically, so that the registry remains the single source of downstream coverage.
45. As a maintainer, I want accepted reference frames to be inspected before hashes move, so that a changed image remains a design decision rather than a checksum update.
46. As a maintainer, I want the full capability gates run once after the narrow loop is green, so that the new catalog entry is proven without turning every edit into a fifteen-minute cycle.
47. As a maintainer, I want one real transparent character asset committed for evaluation, so that the capability is judged against hair, hands and alpha edges rather than a geometric placeholder.

## Implementation Decisions

### D1 — Editorial contract

`character_explainer` is selected when one person, figure or mascot materially carries an
explanation. The character is the visual subject and the copy explains, identifies or frames
that subject. A person who merely appears in contextual imagery belongs in `image_context`;
exact attributed words belong in `quote`; a claim that gains nothing from a character belongs
in `typographic_statement`.

The capability is named `CharacterExplainerScene`, has the agent-facing id
`character_explainer`, and uses the existing `character` family. No new SceneFamily member is
introduced.

### D2 — Pixel ownership and persistence

The SceneCapability owns and renders one character asset for its complete duration. It does
not read, target, animate or suppress a section-level persistent element. The persistent
layer continues to render after scene layers and continues to follow the conflict-resolution
ladder unchanged.

An author should not declare the same character as both this scene's asset and a persistent
element over the same time range. The compiler's collision behavior is a repair mechanism,
not an ownership-transfer protocol, and no deliberate hiding warning is used to coordinate
the two layers.

This is editorial selection guidance, not a new compiler invariant. The capability publishes
it in `avoidWhen` by redirecting uninterrupted character continuity across unrelated scene
kinds to a section-level persistent element. This increment adds no cross-section validation
for matching identities and does not promise to reject a plan that ignores that guidance.

An `identityKey` shares visual identity through the existing resolver cache only. It does not
share layout state, events, motion state or temporal continuity. This decision keeps one
owner for every pixel and adds no new seam between SceneCapabilities and persistent elements.

### D3 — Authored schema

The strict prop schema contains:

- `label`: optional short identity or role, defaulting to empty;
- `headline`: optional concise claim the character carries, defaulting to empty;
- `explanation`: optional supporting copy, defaulting to empty;
- `assetRequirement`: a semantic requirement derived from the shared asset contract and
  narrowed to `type: character`, a `cutout` or `illustration` treatment, and portrait or square
  orientation.

Every field has an agent-facing description. The requirement accepts a natural-language
subject and an optional `identityKey`; it never accepts a path, URI or resolved status.

Hard ceilings remain generous and follow the established image-and-copy precedent: 80
characters for the label, 120 for the headline and 240 for the explanation. Soft constraints
shape normal authoring more tightly and name the degradation they buy: compact label,
headline around one display line, and explanation short enough to remain secondary. Long but
valid copy steps down or wraps within measured geometry; it is not truncated by character
count.

An empty label is ordinary. Empty headline and explanation together remain valid so the
generic stress floor and the normative empty example can exercise a designed copy-empty
state beside a valid character asset.

### D4 — Asset behavior

The capability declares that it requires assets and consumes only the resolved reference
provided through the existing SceneCapability render interface. Ready assets render as
contained cutouts; placeholder and failed references remain explicit degraded states already
decided by the asset loop. The scene never generates a fallback identity and never interprets
an `identityKey` itself.

The asset fills the character slot with containment rather than cover cropping. Motion may
transform that contained result only within an allowance proved by render tests, so the face
and silhouette cannot be lost at the live-frame edge.

The repository already carries the evaluation asset at
`packages/video/public/assets/characters/editorial-explainer-reference.png`. It is a
1024 × 1536 transparent PNG of an original editorial educator, with a three-quarter crop,
both hands visible, a navy/off-white wardrobe and restrained orange accents. Its alpha channel
is part of the test value: hair, fingers and the open explanatory gesture expose failures a
solid geometric stand-in cannot.

The implementation registers this file in the repository-controlled asset library under the
stable `identityKey` `character-explainer-reference`, using a semantic character requirement
with illustration treatment and portrait orientation. The canonical example and focused
render suite reuse that requirement instead of embedding a path in SceneInstance props.

This image is a committed evaluation fixture and initial visual reference, not a public schema
default and not a promise that every generated character must share its identity or exact
style. It may be replaced behind the same library identity after human review without changing
authored plans.

### D5 — Layout, regions and composition

The first increment ships one layout, `sideBySide`: a dominant character cutout on one side
and a bounded copy column on the other. Layout-owned geometry decides their proportions;
agents author neither percentages nor slot coordinates.

It ships full-frame only. The scene truthfully occupies the full frame and initially declares
only the full composition. A left- or right-composed form may be added only after it has been
drawn, inspected and given a real readable arrangement; it is not inferred by shrinking the
full-frame layout.

The layout consumes the compiler-provided safe area through the existing framing primitive,
even though this first increment does not claim a half-frame composition. Persistent-element
conflicts therefore continue to produce the generic relocation or hiding behavior defined by
the compiler.

### D6 — Motion and action vocabulary

All motion is deterministic and derived from the selected motion profile and design tokens.
The capability writes no private easing, duration, camera bound or unseeded randomness.

The baseline visual treatment consists of a bounded entrance followed by subtle ambient
graphic life. Ambient motion is restrained translation, scale or tilt of the whole cutout,
not a simulation of articulated anatomy. Decorative marks such as a halo, rays or a small
ground shadow may participate, provided they resolve from theme roles and remain subordinate
to the explanation.

The closed vocabulary is:

- `revealCharacter`, with no payload;
- `revealCopy`, with no payload;
- `accentCharacter`, with no payload.

`accentCharacter` produces a short reversible emphasis of the whole cutout plus its graphic
treatment. It may repeat; the latest written event restarts the gesture and the frame returns
to the same settled visual state after the accent window.

None of these actions declares a deictic field. Any event may still use a word anchor when
the narration justifies that timing. A deictic field would be incorrect because the action
payload names no spoken content or target.

An instance with no reveal actions begins both default entrances at scene frame zero. Once a
matching reveal action is present, that action holds its visual group back until its resolved
frame. This preserves useful eventless examples while allowing authored timing to take
control.

### D7 — State and capability checks

The event state records explicit entrance frames for the character and copy, plus the most
recent accent frame. `null` means that an authored reveal is still holding a group back; it is
not conflated with an untouched field whose entrance begins at frame zero.

Capability checks judge written event order, never resolved frames. If a SceneInstance
declares `revealCharacter`, an `accentCharacter` written before that reveal is refused because
it would animate an unmounted visual subject. The refusal names the repair: move the accent
after the reveal or remove the explicit reveal. No ordering rule is imposed between the two
independent reveal actions.

No referential check targets a persistent element or an asset identity. Asset shape belongs
to schema validation, identity belongs to the resolver, and persistent placement belongs to
the section compiler.

### D8 — Render construction

The render follows the ordinary capability stack: shared backdrop, camera rig, safe-area
frame and layout. The cutout, copy and didactic marks are composed from existing L0/L1
primitives where they fit. A new primitive is justified only if it hides reusable graphic
behavior behind a smaller interface; a capability-specific transform does not become a
shared primitive merely because it is animated.

The character motion and copy motion remain pure functions of props, resolved assets,
events, frame, theme, motion profile, duration and safe area. There is no runtime state and
no branch in the generic SceneRenderer for the character family.

### D9 — Examples and catalog teaching

At least four normative examples ship:

- a canonical named person with concise explanatory copy;
- a recurring illustrated figure with an `identityKey` and event-driven entrances;
- an edge example exercising long but valid copy;
- an empty-copy example retaining a valid character requirement.

The canonical and edge examples resolve `character-explainer-reference` from the local asset
library so the ordinary grid, still script and render harness all exercise the committed PNG.
The file is not duplicated into a test-fixture directory.

One example demonstrates `accentCharacter` using a boundary anchor. A word anchor is not put
in a SceneExample because examples have no real take; word timing can be exercised through a
compiled-plan render without publishing a compensating example.

The examples teach only scene-owned character assets. None declares or implies a persistent
element, duplicate asset ownership or a handoff between render layers.

### D10 — Registration and generated contracts

The capability uses the common capability folder shape, is assembled through the ordinary
SceneCapability interface and is added once to the registry. The catalog and production
contract projections are regenerated from that registry.

This feature does not change the common capability shape, add a mandatory file, alter a gate
or create a new registration step. The capability procedure therefore needs no structural
documentation update as part of this work.

## Testing Decisions

A good test observes behavior across the registered SceneCapability interface: what the
catalog teaches, what a SceneInstance accepts or refuses, and what pixels a resolved plan
produces. Tests do not assert reducer object shape, raw transform values, private layout
constants or the implementation of the Asset Resolver.

The feature adds no new external testing seam. The existing catalog/validation surface and
the existing render harness together exercise the same SceneCapability interface used by
production.

### Catalog and validation behavior

The generic catalog contract suite proves that the registered capability has truthful
selection metadata, a strict described schema, declared layouts, a closed action vocabulary,
soft constraints, normative examples and regenerated projections.

Capability-focused validation proves:

- accepted character requirements and rejected non-character or unsupported treatments;
- rejection of paths, URIs and resolved asset statuses in authored props;
- acceptance of optional and repeated `identityKey` values without implementing identity
  logic in the scene;
- rejection of unknown layouts and invented actions through the existing generic validator;
- refusal of an accent written before an explicitly declared character reveal;
- acceptance of either reveal order and repeated accents;
- the written-order check without requiring a Take.

Prior art is the asset-bearing image capability for semantic requirements and resolver
wiring, the chart capabilities for closed action vocabularies and referential checks, and the
typographic capability for explicit entrance-frame state.

### Render behavior

A capability-focused render suite proves relations before literal frames:

- an eventless instance reaches the same settled composition as an equivalent instance whose
  explicit reveals have completed;
- before `revealCharacter`, the character group is absent while the independently undriven
  copy remains available;
- before `revealCopy`, the copy group is absent while the independently undriven character
  remains available;
- during `accentCharacter`, the frame differs from the settled frame;
- after the accent settles, the frame returns to the same visual result rather than retaining
  an accidental scale, tilt or mark;
- two renders of the same frame and inputs are identical;
- a ready portrait and a ready square cutout remain contained and recognisable;
- the committed editorial explainer PNG keeps its hair, hands and transparent edges intact on
  the scene's actual ground;
- the empty-copy state is designed and non-blank;
- placeholder and failed asset states remain honest and do not invent a character.

Accepted key-frame hashes cover the canonical entrance, settled composition, accent peak,
edge-copy degradation and empty-copy state. Each accepted hash is accompanied by a sentence
describing the visible frame, and a changed hash is accepted only after inspecting the still.

A compiled-plan render with real word timings proves that `accentCharacter` may begin on a
word anchor even though it has no deictic payload. The compiler's existing anchor tests remain
the source of truth for missing and ambiguous words.

### Safe area, stress and full gates

The generic safe-area and occupied-region sweeps include the registered capability and every
example automatically. They prove that the full-frame declaration is truthful and that the
cutout, copy and decorative effects stay inside the live frame under every motion profile.

The generic schema-driven stress generator exercises floor, recommended, degraded and hard
ceiling content. No capability-specific stress hook is expected because each field is an
independent scalar or an existing semantic asset shape. Add one only if implementation proves
that the generic filler cannot construct a valid cross-field case.

During implementation, run the capability-focused validation, render and filtered stress
tests plus catalog regeneration. Before commit or merge, run the six complete gates in the
documented sequential order; render and stress are not run concurrently on Windows.

## Out of Scope

- Rigged, skeletal or limb animation.
- Lip synchronization, phoneme animation or a talking avatar.
- Video assets, generated pose sequences or multiple pose assets for one character.
- Facial-expression recognition or automatic emotion inference from narration.
- Character-specific camera tracking.
- A character pointing to an arbitrary region of another visual.
- Free-form action names such as `react`, `perform` or `incarnate` whose pixels are not
  precisely defined.
- Animation of section-level persistent elements.
- Passing scene events to the persistent layer.
- Suppressing a persistent element so the scene can replace it.
- Any implicit or explicit ownership handoff between the scene and persistent layer.
- Seamless positional continuity between separate CharacterExplainer SceneInstances.
- A promise that matching `identityKey` values share anything beyond the resolved image.
- Half-frame compositions before their layouts are deliberately designed and inspected.
- Multiple characters in one SceneInstance.
- Comparison, dialogue or interview layouts.
- Changes to the asset-generation loop or provider.
- A new SceneFamily, manifest field, compiler branch or runtime branch.
- A new shared primitive unless implementation demonstrates reusable behavior behind a
  genuinely smaller interface.

## Further Notes

The term “animated character” in this spec means an animated *cutout as a graphic object*.
It must not be used later as evidence that the product promised an articulated presenter.

`identityKey` is important for editorial consistency: a recurring historical figure or
mascot should not silently change appearance between requirements. It remains equally
important not to turn that cache key into a hidden temporal contract. Same picture does not
mean same mounted element.

The roadmap currently describes `character_explainer` as moderate cost because the
persistent character substrate already exists. This spec deliberately does not consume that
substrate. Its moderate cost instead comes from being the first capability in its family,
the second asset-bearing capability, and the first scene whose quality depends on making a
single cutout feel alive without pretending it is a rig.

The architecture proposal still records a sequencing gate around the code-blind proof
harness. `ready-for-agent` means this feature is specified and independently implementable;
it does not silently erase that product-sequencing decision. The owner may open that gate by
choosing this capability as the next increment.
