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

export const STRUCTURAL_PLAN_EXAMPLES: readonly StructuralPlanExample[] = [
  {
    id: 'minimal-context-plan',
    title: 'Smallest complete Beat to Section to SceneInstance partition',
    demonstrates: ['beats', 'sections', 'scenes', 'image_context', 'asset requirement'],
    plan: minimalContextPlan,
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
