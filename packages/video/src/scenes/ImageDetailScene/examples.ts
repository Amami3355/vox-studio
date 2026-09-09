import type { SceneExample } from '../../core/types';
const assetRequirement = {
  type: 'image',
  subject: 'A leaf cross-section with pores along its lower edge',
  treatment: 'illustration',
  orientation: 'landscape',
  identityKey: 'leaf-cross-section',
};
export const imageDetailExamples: SceneExample[] = [
  {
    id: 'example-image-detail-explain',
    title: 'Whole subject to a prepared detail',
    note: 'An illustrated explanation evolves within the same SceneInstance. The accepted image must have its pores at the lower edge.',
    component: 'image_detail',
    layout: 'plate',
    motionProfile: 'subtleDrift',
    spansBeats: ['b1', 'b2', 'b3'],
    props: { headline: '', caption: '', assetRequirement },
    events: [
      { at: 'b2.start', action: 'focus', payload: { region: 'bottom' } },
      { at: 'b2.start', action: 'annotate', payload: { text: 'Pores regulate exchange' } },
      { at: 'b3.start', action: 'clearAnnotation' },
      { at: 'b3.start', action: 'focus', payload: { region: 'whole' } },
    ],
  },
  {
    id: 'example-image-detail-edge',
    title: 'Edge case: contextual copy',
    note: 'Longer context wraps in one lower-left overlay; the image retains the entire frame.',
    component: 'image_detail',
    layout: 'plate',
    motionProfile: 'editorialStatic',
    spansBeats: ['b1'],
    props: {
      headline: 'A small opening connects the leaf with the air around it',
      caption:
        'Conceptual illustration: the relative dimensions are simplified to show the relationship.',
      assetRequirement,
    },
  },
  {
    id: 'example-image-detail-empty',
    title: 'Empty copy: let the image speak',
    note: 'Empty title and caption leave the full image unobstructed, with no scrim or decorative camera crop.',
    component: 'image_detail',
    layout: 'plate',
    motionProfile: 'cinematic',
    spansBeats: ['b1'],
    props: { headline: '', caption: '', assetRequirement },
  },
];
