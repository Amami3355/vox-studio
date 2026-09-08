import type { SceneMeta } from '../../core/types';
export const processStepsMeta: SceneMeta = {
  id: 'process_steps',
  name: 'ProcessStepsScene',
  family: 'diagram',
  summary:
    'A schematic process whose active stage and connecting path advance with narration, without invented dates.',
  useWhen: [
    'explaining a sequence of states, causes or operations',
    'showing how a process reaches its outcome on spoken-word anchors',
  ],
  avoidWhen: [
    'showing dated historical events → timeline',
    'showing the physical appearance of an object → image_detail',
    'comparing measured quantities → bar_chart',
  ],
  supportsEvents: true,
  requiresAssets: false,
  occupiesRegions: ['full'],
  supportedCompositions: ['full'],
  minDurationFrames: 60,
  recommendedDurationFrames: 180,
};
