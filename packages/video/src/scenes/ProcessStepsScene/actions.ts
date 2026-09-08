import type { ActionDef } from '../../core/types';
export const processStepsActions = {
  advance: {
    description:
      'Advance to the next authored stage, animate the connecting path and reveal that stage explanation. The first advance reveals the first stage. Use the word anchor that motivates the change; dates and numerical timings are unnecessary.',
    payload: null,
  },
} as const satisfies Record<string, ActionDef>;
