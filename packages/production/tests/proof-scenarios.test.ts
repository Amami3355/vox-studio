import type { VideoPlan } from '@vox/video';
import { describe, expect, it } from 'vitest';
import { CATALOG_SHOWCASE_CAPABILITIES } from '../src/proof/catalog-showcase';
import {
  PROOF_SCENARIOS,
  PROOF_SCENARIO_KEYS,
  isProofScenarioKey,
  proofScenario,
} from '../src/proof/scenarios';

const planWithImageSecond = (): VideoPlan =>
  ({
    beats: [
      { id: 'b1', text: 'opening' },
      { id: 'b2', text: 'later' },
    ],
    sections: [
      {
        id: 's1',
        spansBeats: ['b1', 'b2'],
        scenes: [
          { id: 'chart', component: 'bar_chart', spansBeats: ['b1'], props: {} },
          { id: 'image', component: 'image_context', spansBeats: ['b2'], props: {} },
        ],
      },
    ],
  }) as unknown as VideoPlan;

describe('proof scenario table', () => {
  it('keeps the frozen short scenario exactly as the paid bundles were judged under', () => {
    const scenario = proofScenario('short');
    expect(scenario.proofId).toBe('northbridge-night-bus-interface-proof-v1');
    expect(scenario.slug).toBe('northbridge-night-bus');
    expect(scenario.assertionScenario).toBe('northbridge');
    expect(scenario.durationBounds).toEqual([20, 30]);
    expect(scenario.targetSeconds).toBe(25);
    expect(scenario.expectedCapabilities).toBeUndefined();
    expect(scenario.recordGate).toBeNull();
  });

  it('keeps the long variant on a separate proof id at its own duration', () => {
    const scenario = proofScenario('long');
    expect(scenario.proofId).toBe('northbridge-night-bus-interface-proof-long-v1');
    expect(scenario.assertionScenario).toBe('northbridge');
    expect(scenario.durationBounds).toEqual([150, 210]);
    expect(scenario.targetSeconds).toBe(180);
  });

  it('keeps the showcase scenario with its breadth requirement and pre-spend gate', () => {
    const scenario = proofScenario('showcase');
    expect(scenario.proofId).toBe('helios-bay-catalog-showcase-proof-v1');
    expect(scenario.slug).toBe('helios-bay-catalog-showcase');
    expect(scenario.assertionScenario).toBe('catalog-showcase');
    expect(scenario.durationBounds).toEqual([100, 140]);
    expect(scenario.targetSeconds).toBe(120);
    expect(scenario.expectedCapabilities).toEqual(CATALOG_SHOWCASE_CAPABILITIES);
    expect(scenario.recordGate).not.toBeNull();
  });

  it('defaults to the short scenario so no existing caller changes behaviour', () => {
    expect(proofScenario()).toBe(PROOF_SCENARIOS.short);
  });

  /**
   * The invariants a new row has to satisfy. Their whole point is that adding a scenario is one
   * edit rather than six, so the thing worth checking is that the one edit is self-consistent —
   * previously nothing checked that the slug, the proof id and the Brief chosen at six separate
   * sites described the same scenario.
   */
  it('holds for every row, including rows added later', () => {
    for (const key of PROOF_SCENARIO_KEYS) {
      const scenario = PROOF_SCENARIOS[key];
      expect(scenario.key).toBe(key);
      // The Brief in front of the agent is the Brief the bundle claims to be evidence for.
      expect(scenario.request.brief.id).toBe(scenario.proofId);
      expect(scenario.slug).toMatch(/^[a-z0-9-]+$/u);
      const [minimum, maximum] = scenario.durationBounds;
      expect(minimum).toBeLessThan(scenario.targetSeconds);
      expect(maximum).toBeGreaterThan(scenario.targetSeconds);
      expect(scenario.nonClaims.length).toBeGreaterThan(0);
      // A bundle whose human verdict does not carry exactly six rows can never be signed off.
      expect(scenario.humanVerdictRows).toHaveLength(6);
    }
  });

  it('scores the image the Brief actually named', () => {
    const plan = planWithImageSecond();
    // Northbridge names the *opening* image, and this plan does not have one there.
    expect(PROOF_SCENARIOS.short.scoredImageScene(plan)).toBeUndefined();
    // The showcase names one image among eight scenes, wherever it falls.
    expect(PROOF_SCENARIOS.showcase.scoredImageScene(plan)?.id).toBe('image');
  });

  it('refuses a plan the showcase Brief does not support, before anything is spent', () => {
    const violations = PROOF_SCENARIOS.showcase.recordGate?.(planWithImageSecond()) ?? [];
    expect(violations).toContain('capabilities');
  });

  it('recognises only the keys the table defines', () => {
    expect(isProofScenarioKey('showcase')).toBe(true);
    expect(isProofScenarioKey('helios-bay')).toBe(false);
    expect(isProofScenarioKey('toString')).toBe(false);
  });
});
