import type { VideoPlan } from '@vox/video';
import type { ProductionRequest } from '../contracts/schemas';

export const CATALOG_SHOWCASE_PROOF_ID = 'helios-bay-catalog-showcase-proof-v1';

export const CATALOG_SHOWCASE_BRIEF =
  'Create a 110–130-second English editorial explainer about the fictional coastal city of Helios Bay and its fictional clean-energy resilience programme. Use every capability available in the supplied catalogue exactly once, for exactly eight visually distinct scenes, and give every scene at least one supported event. Discover the capability and action names from the public contracts rather than assuming them. Open with the thesis “Resilience is built one connection at a time.” Establish Helios Bay at dawn with a documentary image requirement showing a working harbour, wind turbines and rooftop solar. Introduce Maya Sen, the fictional grid coordinator responsible for keeping power available during storms; explain her role, pressure and decision clearly. Show the programme chronology: a grid audit on 2027-02-12, the harbour battery opening on 2028-06-03, three neighbourhood microgrids connecting on 2029-09-18, and the old diesel reserve retiring on 2030-12-01. Show renewable electricity rising from 24 percent in 2027 to 39 percent in 2028, 55 percent in 2029 and 72 percent in 2030. Compare annual outage minutes after the rollout: Harbour Ward 42, East Bank 27 and Hillside 16. Make 72 percent the single headline statistic. Include this exact quote once, attributed to fictional night-shift nurse Samira Vale: “The lights stayed on when the storm crossed the bay.” End by explaining that the programme did not eliminate risk; it shortened outages and gave essential workers a more dependable city. Treat every person, place, date, quote and figure as fictional test data, not real-world claims. Keep the narration coherent and natural rather than describing the interface or naming scene components aloud.';

export const CATALOG_SHOWCASE_REQUEST: ProductionRequest = {
  protocolVersion: 1,
  brief: { id: CATALOG_SHOWCASE_PROOF_ID, text: CATALOG_SHOWCASE_BRIEF },
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

export const CATALOG_SHOWCASE_CAPABILITIES = [
  'bar_chart',
  'character_explainer',
  'image_context',
  'line_chart',
  'quote',
  'stat_counter',
  'timeline',
  'typographic_statement',
] as const;

const requiredNarrationFragments = [
  ['thesis', 'resilience is built one connection at a time'],
  ['maya-sen', 'maya sen'],
  ['samira-vale', 'samira vale'],
  ['quote', 'the lights stayed on when the storm crossed the bay'],
  ['2027', '2027', 'twenty twenty seven'],
  ['2028', '2028', 'twenty twenty eight'],
  ['2029', '2029', 'twenty twenty nine'],
  ['2030', '2030', 'twenty thirty'],
  ['24-percent', '24 percent', 'twenty four percent'],
  ['39-percent', '39 percent', 'thirty nine percent'],
  ['55-percent', '55 percent', 'fifty five percent'],
  ['72-percent', '72 percent', 'seventy two percent'],
  ['harbour-ward', 'harbour ward', 'harbor ward'],
  ['east-bank', 'east bank'],
  ['hillside', 'hillside'],
] as const;

/** Trusted, pre-spend guard for the catalogue showcase brief. */
export const catalogShowcasePlanViolations = (plan: VideoPlan): string[] => {
  const violations: string[] = [];
  const scenes = plan.sections.flatMap((section) => section.scenes);
  const capabilities = [...new Set(scenes.map((scene) => scene.component))].sort();
  const expected = [...CATALOG_SHOWCASE_CAPABILITIES].sort();
  if (JSON.stringify(capabilities) !== JSON.stringify(expected)) {
    violations.push('capabilities');
  }
  if (scenes.length !== CATALOG_SHOWCASE_CAPABILITIES.length) violations.push('scene-count');
  if (scenes.some((scene) => (scene.events?.length ?? 0) < 1)) {
    violations.push('event-coverage');
  }
  const imageScene = scenes.find((scene) => scene.component === 'image_context');
  const imageRequirement = imageScene?.props.assetRequirement as
    | { type?: unknown; subject?: unknown }
    | undefined;
  if (
    imageRequirement?.type !== 'image' ||
    typeof imageRequirement.subject !== 'string' ||
    !/(?:harbou?r|helios|wind|solar)/i.test(imageRequirement.subject)
  ) {
    violations.push('image-requirement');
  }
  const narration = plan.beats.map((beat) => beat.text).join(' ');
  const words = narration.trim().split(/\s+/u).filter(Boolean).length;
  if (words < 230 || words > 310) violations.push(`word-count:${words}`);
  const normalizedNarration = narration
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, ' ')
    .trim()
    .replaceAll(/\s+/gu, ' ');
  for (const [id, ...alternatives] of requiredNarrationFragments) {
    if (!alternatives.some((fragment) => normalizedNarration.includes(fragment))) {
      violations.push(`narration:${id}`);
    }
  }
  return violations;
};

export const CATALOG_SHOWCASE_NON_CLAIMS = [
  'measurement-gate validity',
  'factual-research quality',
  'successful authorised replacement',
  'crash or concurrent-command behaviour',
  'cross-platform transport',
  'service or key compromise resistance',
  'provider reliability or performance statistics',
  'final-image or final-frame premium',
] as const;
