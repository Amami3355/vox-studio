import type { VideoPlan } from '@vox/video';
import { describe, expect, it } from 'vitest';
import {
  CATALOG_SHOWCASE_CAPABILITIES,
  catalogShowcasePlanViolations,
} from '../src/proof/catalog-showcase';

const compliantPlan = (): VideoPlan => {
  const core =
    'Resilience is built one connection at a time. Maya Sen coordinates the fictional grid. Samira Vale said the lights stayed on when the storm crossed the bay. The timeline covers 2027, 2028, 2029 and 2030. Renewable electricity moves through 24 percent, 39 percent, 55 percent and 72 percent. Harbour Ward, East Bank and Hillside compare annual outage minutes.';
  const coreWords = core.split(/\s+/u);
  const narration = [
    ...coreWords,
    ...Array.from({ length: 250 - coreWords.length }, () => 'detail'),
  ].join(' ');
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

describe('catalogue showcase paid-record guard', () => {
  it('accepts a full-length plan with all current capabilities and required facts', () => {
    expect(catalogShowcasePlanViolations(compliantPlan())).toEqual([]);
  });

  it('rejects the unrelated short menu plan before synthesis', () => {
    const plan = compliantPlan();
    plan.beats = [{ id: 'b1', text: 'Four menu favourites have clear prices.' }];
    plan.sections[0]!.scenes = [plan.sections[0]!.scenes[0]!];
    expect(catalogShowcasePlanViolations(plan)).toContain('capabilities');
    expect(catalogShowcasePlanViolations(plan)).toContain('scene-count');
    expect(catalogShowcasePlanViolations(plan)).toContain('word-count:6');
  });
});
