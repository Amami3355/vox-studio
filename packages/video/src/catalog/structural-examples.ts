import verticalSlicePlan from '../plans/vertical-slice.plan.json';
import { type VideoPlan, videoPlanSchema } from './plan-shape';

export type StructuralPlanExample = {
  id: string;
  title: string;
  demonstrates: string[];
  plan: VideoPlan;
};

const minimalContextPlan: VideoPlan = {
  beats: [{ id: 'b1', text: 'At dusk, the last ferry turns toward the harbour.' }],
  sections: [
    {
      id: 'harbour',
      spansBeats: ['b1'],
      scenes: [
        {
          id: 'harbour-context',
          component: 'image_context',
          layout: 'splitLeft',
          motionProfile: 'subtleDrift',
          spansBeats: ['b1'],
          props: {
            headline: 'The last crossing',
            caption: 'One beat, one section and one scene form the smallest complete partition.',
            assetRequirement: {
              type: 'image',
              subject: 'Passenger ferry approaching a harbour at dusk',
              treatment: 'photo',
              orientation: 'landscape',
            },
          },
        },
      ],
    },
  ],
};

/**
 * The seven-anchor sweep, published as a plan because it cannot be published as a render.
 *
 * `typographic_statement.advanceWord` is written one event per word, and the form that
 * matters is the one anchored to the words themselves. No `examples.ts` in the library can
 * carry it, for the reason that file states and ADR-0012 decides; a structural plan example
 * is the route out both name, and this is it.
 *
 * Every word of the statement appears in the beat text exactly once, which is not a
 * coincidence and is the thing to copy: a word anchor naming a word its beat speaks twice
 * is refused rather than resolved to the first match.
 */
const wordDrivenStatementPlan: VideoPlan = {
  beats: [
    { id: 'b7', text: 'Nobody is left to absorb the difference.' },
    { id: 'b8', text: 'What follows is an account of who pays instead.' },
  ],
  sections: [
    {
      id: 'act-two',
      spansBeats: ['b7', 'b8'],
      scenes: [
        {
          id: 'act-two-card',
          component: 'typographic_statement',
          layout: 'cut',
          motionProfile: 'editorialStatic',
          spansBeats: ['b7', 'b8'],
          props: {
            eyebrow: 'Chapter two',
            statement: 'Nobody is left to absorb the difference',
            ordinal: '02 / 05',
            emphasis: 'neutral',
          },
          events: [
            { at: 'b7.start', action: 'revealStatement' },
            { at: 'b7.word:Nobody', action: 'advanceWord' },
            { at: 'b7.word:is', action: 'advanceWord' },
            { at: 'b7.word:left', action: 'advanceWord' },
            { at: 'b7.word:to', action: 'advanceWord' },
            { at: 'b7.word:absorb', action: 'advanceWord' },
            { at: 'b7.word:the', action: 'advanceWord' },
            { at: 'b7.word:difference', action: 'advanceWord' },
          ],
        },
      ],
    },
  ],
};

export const STRUCTURAL_PLAN_EXAMPLES: readonly StructuralPlanExample[] = [
  {
    id: 'minimal-context-plan',
    title: 'Smallest complete Beat to Section to SceneInstance partition',
    demonstrates: ['beats', 'sections', 'scenes', 'image_context', 'asset requirement'],
    plan: minimalContextPlan,
  },
  {
    id: 'word-driven-statement-plan',
    title: 'A chapter card whose sweep follows the recorded take, word by word',
    demonstrates: [
      'typographic_statement',
      'word anchor',
      'one event per word',
      'events no scene example can carry',
    ],
    plan: wordDrivenStatementPlan,
  },
  {
    id: 'multi-capability-persistent-plan',
    title: 'Multiple capabilities, persistent placement and semantic events',
    demonstrates: [
      'multiple capabilities',
      'persistent elements',
      'placements',
      'events',
      'word anchor',
      'section and scene partitions',
    ],
    plan: videoPlanSchema.parse(verticalSlicePlan),
  },
];
