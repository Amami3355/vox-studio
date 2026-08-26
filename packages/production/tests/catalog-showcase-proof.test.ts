import type { VideoPlan } from '@vox/video';
import { describe, expect, it } from 'vitest';
import {
  CATALOG_SHOWCASE_CAPABILITIES,
  catalogShowcasePlanViolations,
} from '../src/proof/catalog-showcase';

const compliantPlan = (): VideoPlan => {
  const narration =
    'Resilience is built one connection at a time. Maya Sen coordinates the fictional grid. Samira Vale said the lights stayed on when the storm crossed the bay. The timeline covers 2027, 2028, 2029 and 2030. Renewable electricity moves through 24 percent, 39 percent, 55 percent and 72 percent. Harbour Ward, East Bank and Hillside compare annual outage minutes.';
  return {
    beats: [{ id: 'b1', text: narration }],
    sections: [
      {
        id: 'showcase',
        spansBeats: ['b1'],
        scenes: CATALOG_SHOWCASE_CAPABILITIES.map((component, index) => ({
          id: `scene-${index}`,
          component,
          layout: 'test',
          motionProfile: 'editorialStatic',
          spansBeats: ['b1'],
          props:
            component === 'image_context'
              ? {
                  assetRequirement: {
                    type: 'image',
                    subject: 'Helios Bay harbour with wind and solar power',
                  },
                }
              : {},
          events: [{ at: 'scene.start', action: 'test' }],
        })),
      },
    ],
  } as unknown as VideoPlan;
};

describe('catalogue showcase brief compliance', () => {
  it('accepts a plan with all current capabilities and required facts', () => {
    expect(catalogShowcasePlanViolations(compliantPlan())).toEqual([]);
  });

  it('names what the unrelated short menu plan misses', () => {
    const plan = compliantPlan();
    plan.beats = [{ id: 'b1', text: 'Four menu favourites have clear prices.' }];
    plan.sections[0]!.scenes = [plan.sections[0]!.scenes[0]!];
    expect(catalogShowcasePlanViolations(plan)).toContain('capabilities');
    expect(catalogShowcasePlanViolations(plan)).toContain('scene-count');
  });
});
