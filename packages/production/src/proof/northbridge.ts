import type { VideoPlan } from '@vox/video';
import type { ProductionRequest } from '../contracts/schemas';

export const NORTHBRIDGE_PROOF_ID = 'northbridge-night-bus-interface-proof-v1';

export const NORTHBRIDGE_BRIEF =
  "Create a 20–30-second English editorial explainer about the fictional city of Northbridge's overnight-bus pilot, using only the supplied test facts. Open on a documentary image of a rain-soaked Northbridge bus stop before dawn, then show weekday boardings rising from 12,000 before the pilot to 15,000 in January and 18,000 in March. The narration must say “March” exactly once and the 18,000 March result must be singled out precisely when that word is spoken. End by explaining that the extra 6,000 trips widened access for late-shift workers. Treat Northbridge and all figures as fictional test data, not real-world claims.";

export const NORTHBRIDGE_TASK_MESSAGE =
  'Using vox and request.json, create a valid VideoPlan and produce the narrated preview MP4. Use the public contract discovery commands; do not seek external help.';

export const NORTHBRIDGE_REQUEST: ProductionRequest = {
  protocolVersion: 1,
  brief: { id: NORTHBRIDGE_PROOF_ID, text: NORTHBRIDGE_BRIEF },
  production: {
    voice: {
      provider: 'elevenlabs',
      voiceId: 'JBFqnCBsd6RMkjVDRZzb',
      modelId: 'eleven_v3',
      seed: 7,
    },
    maxNewTakes: 1,
  },
};

/** Regression-only authoring fixture. It is never evidence of unscripted agent authorship. */
export const NORTHBRIDGE_FIXTURE_PLAN: VideoPlan = {
  beats: [
    {
      id: 'b1',
      text: 'Before dawn, rain covered a Northbridge bus stop as the fictional overnight pilot began.',
    },
    {
      id: 'b2',
      text: 'Weekday boardings rose from 12,000 before the pilot to 15,000 in January.',
    },
    {
      id: 'b3',
      text: 'By March, they reached 18,000, the result the city singled out.',
    },
    {
      id: 'b4',
      text: 'Those extra 6,000 trips widened access for late-shift workers across the fictional city.',
    },
  ],
  sections: [
    {
      id: 'northbridge-pilot',
      spansBeats: ['b1', 'b2', 'b3', 'b4'],
      scenes: [
        {
          id: 'agent-selected-context',
          component: 'image_context',
          layout: 'splitLeft',
          motionProfile: 'cinematic',
          spansBeats: ['b1'],
          props: {
            headline: 'Before dawn in Northbridge',
            caption: 'A fictional overnight-bus pilot begins in the rain.',
            assetRequirement: {
              type: 'image',
              subject: 'A rain-soaked Northbridge bus stop before dawn',
              treatment: 'photo',
              orientation: 'landscape',
              identityKey: 'proof-northbridge-before-dawn-v1',
            },
          },
        },
        {
          id: 'boarding-growth',
          component: 'bar_chart',
          layout: 'standard',
          motionProfile: 'energetic',
          pace: 'measured',
          spansBeats: ['b2', 'b3', 'b4'],
          props: {
            title: 'Weekday boardings',
            unit: '',
            emphasis: 'positive',
            data: [
              { label: 'Before', value: 12_000 },
              { label: 'January', value: 15_000 },
              { label: 'March', value: 18_000 },
            ],
          },
          events: [
            { at: 'b2.start', action: 'showBaseline' },
            { at: 'b2.start+long', action: 'revealAll' },
            {
              at: 'b3.word:March',
              action: 'highlightBar',
              payload: { label: 'March' },
            },
          ],
        },
      ],
    },
  ],
};

export const NORTHBRIDGE_NON_CLAIMS = [
  'measurement-gate validity',
  'catalogue selection or action-vocabulary breadth',
  'Decline quality',
  'successful authorised replacement',
  'crash or concurrent-command behaviour',
  'cross-platform transport',
  'service or key compromise resistance',
  'provider reliability or performance statistics',
  'factual-research quality',
  'final-image or final-frame premium',
  'gap 8',
] as const;
