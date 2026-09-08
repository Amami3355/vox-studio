import type { SceneExample } from '../../core/types';
const steps = [
  { label: 'Intake', detail: 'Material enters the system.' },
  { label: 'Transformation', detail: 'The system changes the material.' },
  { label: 'Output', detail: 'The transformed material leaves the system.' },
];
export const processStepsExamples: SceneExample[] = [
  {
    id: 'example-process-steps-driven',
    title: 'Explain a process as it unfolds',
    note: 'Boundary anchors illustrate progression; a real Take supports word anchors on the phrase motivating each stage.',
    component: 'process_steps',
    layout: 'path',
    motionProfile: 'energetic',
    spansBeats: ['b1', 'b2', 'b3'],
    props: { headline: 'From input to outcome', steps },
    events: [
      { at: 'b1.start', action: 'advance' },
      { at: 'b2.start', action: 'advance' },
      { at: 'b3.start', action: 'advance' },
    ],
  },
  {
    id: 'example-process-steps-edge',
    title: 'Edge case — one state',
    note: 'A single state has a marker and explanation, with no invented connection.',
    component: 'process_steps',
    layout: 'path',
    motionProfile: 'editorialStatic',
    spansBeats: ['b1'],
    props: {
      headline: '',
      steps: [{ label: 'Equilibrium', detail: 'The system remains in balance.' }],
    },
  },
  {
    id: 'example-process-steps-empty',
    title: 'Empty process',
    note: 'An empty process preserves its contextual title and an unavailable-process label without inventing stages.',
    component: 'process_steps',
    layout: 'path',
    motionProfile: 'editorialStatic',
    spansBeats: ['b1'],
    props: { headline: 'No stages established', steps: [] },
  },
];
