/**
 * Examples are normative. The agent imitates them far more faithfully than it follows a
 * description, so the set has to cover the shape of the problem and not just its happy
 * path: the canonical slice shot, an edge case that pushes copy past the recommended
 * band, and an empty case that proves the scene survives with no copy at all.
 *
 * The canonical example carries an `identityKey` the repository library answers, so the
 * one thing this increment had to demonstrate — a semantic requirement resolving to real
 * committed media without the SceneInstance changing — is visible in Remotion Studio and
 * not only in a test.
 */
import type { SceneExample } from '../../core/types';

export const imageContextExamples: SceneExample[] = [
  {
    id: 'example-housing-context',
    title: 'Housing context opener',
    note: 'Canonical image-led opening for the housing and rent vertical slice.',
    component: 'image_context',
    layout: 'splitLeft',
    motionProfile: 'cinematic',
    spansBeats: ['b1'],
    props: {
      headline: 'The rent squeeze is reshaping city life',
      caption: 'A growing share of income now disappears before the month begins.',
      assetRequirement: {
        type: 'image',
        subject: 'Dense apartment buildings in a European city at dusk',
        treatment: 'photo',
        orientation: 'landscape',
        identityKey: 'housing-city-context',
      },
    },
  },
  {
    id: 'example-long-context',
    title: 'Edge case — long editorial copy',
    note: 'Edge case for headline density, caption length, and a portrait-oriented request.',
    component: 'image_context',
    layout: 'splitLeft',
    motionProfile: 'subtleDrift',
    spansBeats: ['b1'],
    props: {
      headline:
        'For first-time buyers, the distance between wages and housing costs keeps widening',
      caption:
        'Even households that save consistently are watching deposits and monthly payments move further out of reach in the largest cities.',
      assetRequirement: {
        type: 'image',
        subject: 'Young renter looking through an apartment window above a crowded city street',
        treatment: 'illustration',
        orientation: 'portrait',
      },
    },
  },
  /**
   * The only example that drives the scene from the plan, and it drives exactly two of the
   * three verbs.
   *
   * `emphasize` is absent because it *cannot* be here: it declares a deictic field, so the
   * compiler requires a word anchor for it, and a scene example has no take —
   * `syntheticBeats` gives it `words: []`, against which a word anchor throws by design.
   *
   * Nothing is lost by the absence, and no example was invented elsewhere to compensate —
   * one was, and it was removed. See ADR-0012, which is the decision this omission follows
   * from, and the Teaching surface entry in `CONTEXT.md`. `bar_chart` makes the opposite
   * choice with the same constraint and illustrates `highlightBar` at a boundary; both are
   * legal under that ADR and neither is a defect.
   */
  {
    id: 'example-driven-context',
    title: 'Plan-driven reveal — the image lands before the copy',
    note: 'The plan holds the copy back a beat, so the image is alone on the frame while the narration reaches its subject.',
    component: 'image_context',
    layout: 'splitLeft',
    motionProfile: 'subtleDrift',
    spansBeats: ['b1', 'b2'],
    events: [
      { at: 'b1.start', action: 'revealImage' },
      { at: 'b2.start', action: 'revealCopy' },
    ],
    props: {
      headline: 'A city built for cars, retrofitted for people',
      caption: 'The rebuild took eleven years and two referendums.',
      assetRequirement: {
        type: 'image',
        subject: 'Wide boulevard being narrowed for a tram line, seen from above',
        treatment: 'photo',
        orientation: 'landscape',
      },
    },
  },
  {
    id: 'example-empty-context',
    title: 'Empty case — unresolved image and copy',
    note: 'Empty copy remains renderable while the subject-labelled asset placeholder carries context.',
    component: 'image_context',
    layout: 'splitLeft',
    motionProfile: 'editorialStatic',
    spansBeats: ['b1'],
    props: {
      headline: '',
      caption: '',
      assetRequirement: {
        type: 'image',
        subject: 'Housing context image pending',
        treatment: 'duotone',
        orientation: 'landscape',
      },
    },
  },
];
