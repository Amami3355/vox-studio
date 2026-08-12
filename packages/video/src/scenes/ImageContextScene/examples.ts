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
