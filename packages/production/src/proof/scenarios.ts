/**
 * One proof scenario is one record here.
 *
 * The showcase scenario was added by repeating the same `showcase ? … : …` conditional across
 * roughly six sites — the Brief, the proof id, the slug, the non-claims, the duration window and
 * the pre-spend gate. A third scenario would have put a fourth branch in each of them, and a
 * scenario whose values are assembled from six independent conditionals is one edit away from
 * being subtly wrong in a way no assertion names: nothing checks that the slug, the proof id and
 * the Brief chosen at six separate sites describe the same scenario.
 *
 * So the values live together, keyed once. Selecting a scenario is a lookup, and adding one is a
 * row.
 */

import type { VideoPlan } from '@vox/video';
import type { ProductionRequest } from '../contracts/schemas';
import {
  CATALOG_SHOWCASE_CAPABILITIES,
  CATALOG_SHOWCASE_NON_CLAIMS,
  CATALOG_SHOWCASE_PROOF_ID,
  CATALOG_SHOWCASE_REQUEST,
} from './catalog-showcase';
import {
  NORTHBRIDGE_LONG_PROOF_ID,
  NORTHBRIDGE_LONG_REQUEST,
  NORTHBRIDGE_NON_CLAIMS,
  NORTHBRIDGE_PROOF_ID,
  NORTHBRIDGE_REQUEST,
} from './northbridge';

type PlanScene = VideoPlan['sections'][number]['scenes'][number];

/** What a caller asks for. `short` stays the default so no existing caller changes behaviour. */
export type ProofScenarioKey = 'short' | 'long' | 'showcase';

/**
 * Which family of assertions scores the run. Two scenarios can share one family: `short` and
 * `long` are the same Brief at two durations and are judged by the same scenario assertions.
 */
export type ProofAssertionScenario = 'northbridge' | 'catalog-showcase';

export type ProofScenario = {
  key: ProofScenarioKey;
  assertionScenario: ProofAssertionScenario;
  proofId: string;
  /** Names the evidence directory and the Run id prefix. */
  slug: string;
  /** Heading of the evidence bundle's SUMMARY.md. */
  title: string;
  request: ProductionRequest;
  nonClaims: readonly string[];
  /**
   * `durationBounds` is the acceptance window — the long Brief asks for 170–190 s and gets the
   * same proportional slack the short one gets. `targetSeconds` is what the Brief actually asks
   * for, and it sets the repair budget; the two are kept separate so widening the window for
   * slack never silently buys the agent more repair attempts.
   */
  durationBounds: readonly [number, number];
  targetSeconds: number;
  /** Every capability the Brief demands, or undefined when the Brief does not demand breadth. */
  expectedCapabilities?: readonly string[];
  /** The rows a human is asked to judge, in the order they are watched for. */
  humanVerdictRows: readonly string[];
  /**
   * Which `image_context` scene's asset resolution the assertions score. The Northbridge Brief
   * names the *opening* image specifically; the showcase Brief has one image among eight scenes
   * and does not require it first.
   */
  scoredImageScene: (plan: VideoPlan) => PlanScene | undefined;
};

const scenesOf = (plan: VideoPlan): PlanScene[] =>
  plan.sections.flatMap((section) => section.scenes);

export const imageSceneSpanningOpeningBeat = (plan: VideoPlan): PlanScene | undefined => {
  const openingBeatId = plan.beats[0]?.id;
  return scenesOf(plan).find(
    (scene) =>
      scene.component === 'image_context' &&
      openingBeatId !== undefined &&
      scene.spansBeats.includes(openingBeatId),
  );
};

export const firstImageScene = (plan: VideoPlan): PlanScene | undefined =>
  scenesOf(plan).find((scene) => scene.component === 'image_context');

const northbridgeHumanVerdictRows = [
  'narration intelligible, complete, continuous and fact-matching',
  'March highlight perceptibly lands on the unique spoken word',
  'opening, chart, hierarchy, transitions and ending are legible',
  'placeholder is honest visible degradation',
  'composition, typography, motion and pace are system-premium',
  'complete preview is watchable and listenable without explanation',
] as const;

export const PROOF_SCENARIOS: Readonly<Record<ProofScenarioKey, ProofScenario>> = {
  short: {
    key: 'short',
    assertionScenario: 'northbridge',
    proofId: NORTHBRIDGE_PROOF_ID,
    slug: 'northbridge-night-bus',
    title: 'Northbridge production-interface',
    request: NORTHBRIDGE_REQUEST,
    nonClaims: NORTHBRIDGE_NON_CLAIMS,
    durationBounds: [20, 30],
    targetSeconds: 25,
    humanVerdictRows: northbridgeHumanVerdictRows,
    scoredImageScene: imageSceneSpanningOpeningBeat,
  },
  long: {
    key: 'long',
    assertionScenario: 'northbridge',
    proofId: NORTHBRIDGE_LONG_PROOF_ID,
    slug: 'northbridge-night-bus',
    title: 'Northbridge production-interface',
    request: NORTHBRIDGE_LONG_REQUEST,
    nonClaims: NORTHBRIDGE_NON_CLAIMS,
    durationBounds: [150, 210],
    targetSeconds: 180,
    humanVerdictRows: northbridgeHumanVerdictRows,
    scoredImageScene: imageSceneSpanningOpeningBeat,
  },
  showcase: {
    key: 'showcase',
    assertionScenario: 'catalog-showcase',
    proofId: CATALOG_SHOWCASE_PROOF_ID,
    slug: 'helios-bay-catalog-showcase',
    title: 'Helios Bay catalogue showcase',
    request: CATALOG_SHOWCASE_REQUEST,
    nonClaims: CATALOG_SHOWCASE_NON_CLAIMS,
    durationBounds: [100, 140],
    targetSeconds: 120,
    expectedCapabilities: CATALOG_SHOWCASE_CAPABILITIES,
    humanVerdictRows: [
      'narration is intelligible, complete, continuous and matches every fictional fact',
      'all eight catalogue capabilities are perceptibly distinct and synchronized to the voice',
      'character, chronology, trend, comparison, statistic and quote remain legible',
      'the image placeholder is honest visible degradation',
      'composition, typography, motion and pace remain coherent across the full film',
      'the complete preview is watchable and listenable without explanation',
    ],
    scoredImageScene: firstImageScene,
  },
};

export const PROOF_SCENARIO_KEYS = Object.keys(PROOF_SCENARIOS) as ProofScenarioKey[];

export const isProofScenarioKey = (value: unknown): value is ProofScenarioKey =>
  typeof value === 'string' && Object.hasOwn(PROOF_SCENARIOS, value);

/** The one way to read a scenario. `short` is the default the frozen paid proofs ran. */
export const proofScenario = (key: ProofScenarioKey = 'short'): ProofScenario =>
  PROOF_SCENARIOS[key];
