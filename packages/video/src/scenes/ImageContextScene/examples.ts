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
    layout: 'bottomLeft',
    motionProfile: 'cinematic',
    spansBeats: ['b1'],
    props: {
      headline: 'The rent squeeze',
      caption: 'Housing takes a growing share of income.',
      assetRequirement: {
        type: 'image',
        subject: 'City apartments at dusk, open foreground at bottom left',
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
   * This example reveals the image, reveals the message, then leaves the image alone.
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
   *
   * It deliberately requests the **same picture as the canonical example** — the same
   * `identityKey`, resolving to the same committed media. It makes the driven example
   * directly viewable with repository assets, which
   * matters more than it sounds. Written first with copy of its own and no `identityKey`,
   * it could resolve to nothing but the subject placeholder — so the one example whose
   * behaviour was new was the one example no still could show.
   */
  {
    id: 'example-driven-context',
    title: 'Plan-driven reveal — the image lands before the copy',
    note: 'The image arrives alone; the message enters on the next beat and leaves on the third, giving the viewer time with the image. Same media as the canonical example.',
    component: 'image_context',
    layout: 'bottomLeft',
    motionProfile: 'subtleDrift',
    spansBeats: ['b1', 'b2', 'b3'],
    events: [
      { at: 'b1.start', action: 'revealImage' },
      { at: 'b2.start', action: 'revealCopy' },
      { at: 'b3.start', action: 'hideCopy' },
    ],
    props: {
      headline: 'Rent takes its share before anything else',
      caption: 'For a growing number of households, the month is already spoken for.',
      assetRequirement: {
        type: 'image',
        subject: 'City apartments at dusk, open foreground at bottom left',
        treatment: 'photo',
        orientation: 'landscape',
        identityKey: 'housing-city-context',
      },
    },
  },
  {
    id: 'example-empty-context',
    title: 'Empty case — unresolved image and copy',
    note: 'Empty copy remains renderable while the subject-labelled asset placeholder carries context.',
    component: 'image_context',
    layout: 'bottomLeft',
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

// Alternate placements teach the planner how to keep text away from the subject.
for (const [layout, headline, subject] of [
  [
    'bottomRight',
    'A city under pressure',
    'Apartment blocks on the left, quiet dusk foreground on the right',
  ],
  [
    'lowerThird',
    'Where the city comes home',
    'Wide city skyline above a calm foreground for bottom text',
  ],
] as const) {
  imageContextExamples.push({
    id: `example-context-${layout}`,
    title: `Documentary context with ${layout} text`,
    note: 'Same repository image, alternate editorial placement. Compose production images for the selected text area.',
    component: 'image_context',
    layout,
    motionProfile: 'cinematic',
    spansBeats: ['b1'],
    props: {
      headline,
      caption: 'One image. One editorial idea.',
      imageFocus: layout === 'bottomRight' ? 'left' : 'top',
      assetRequirement: {
        type: 'image',
        subject,
        treatment: 'photo',
        orientation: 'landscape',
        identityKey: 'housing-city-context',
      },
    },
  });
}
