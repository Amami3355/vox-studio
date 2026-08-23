/**
 * Runtime integration for `character_explainer`, at the public render boundary.
 *
 * Three kinds of question, deliberately kept apart. The first block asks relations
 * between hashes — what the events, the asset states and the orientations *change* — so
 * it keeps meaning something on a machine whose font rendering differs. The key-frame
 * baseline holds literal hashes accepted after visual review, each with a sentence
 * saying what the frame shows. The compiled-plan block at the foot is the only place the
 * accent is proven against real word timings, because a scene example has no take.
 */
import { describe, expect, it } from 'vitest';
import type { VideoPlan } from '../../src/catalog/validate';
import { compile } from '../../src/compile';
import type { CompiledDocument } from '../../src/compile/document';
import type { AssetRef, ResolvedSceneAssets } from '../../src/core/assets';
import type { TimedBeat } from '../../src/core/types';
import { hashStill, renderHarness } from './harness';

/**
 * Ready stand-ins with real transparency, so the containment and the bottom-anchored
 * crop are exercised as they are against the committed PNG: a figure shape drawn on a
 * transparent SVG ground, portrait and square.
 */
const PORTRAIT_READY: AssetRef = {
  status: 'ready',
  uri: 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22600%22%20height=%22900%22%3E%3Ccircle%20cx=%22300%22%20cy=%22180%22%20r=%22110%22%20fill=%22%23141922%22/%3E%3Cpath%20d=%22M90%20900C90%20480%20210%20340%20300%20340C390%20340%20510%20480%20510%20900Z%22%20fill=%22%23141922%22/%3E%3C/svg%3E',
};

const SQUARE_READY: AssetRef = {
  status: 'ready',
  uri: 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22900%22%20height=%22900%22%3E%3Ccircle%20cx=%22450%22%20cy=%22260%22%20r=%22140%22%20fill=%22%232C2632%22/%3E%3Cpath%20d=%22M130%20900C130%20520%20290%20420%20450%20420C610%20420%20770%20520%20770%20900Z%22%20fill=%22%232C2632%22/%3E%3C/svg%3E',
};

const PLACEHOLDER_ASSET: AssetRef = {
  status: 'placeholder',
  uri: 'asset://placeholder/image',
  pendingRequirementId: 'req_pending_render',
};

const FAILED_ASSET: AssetRef = {
  status: 'failed',
  uri: 'asset://placeholder/image',
  requirementId: 'req_failed_render',
  reason: 'Deliberate runtime integration fixture.',
};

const CANONICAL_EXAMPLE_ID = 'example-explainer-canonical';

/**
 * Frames in the examples, which all run 180. The driven example brings its copy in at
 * frame 20, its character at frame 60 and its second accent at frame 120, so these are
 * where its states are visible: the entrance mid-wipe, the held frame, the accent's
 * peak (a 40-frame window from frame 120), and everything at rest.
 */
const ENTRANCE_FRAME = 6;
const HOLD_FRAME = 45;
const ACCENT_PEAK_FRAME = 140;
const SETTLED_FRAME = 178;

const harness = renderHarness();

const renderHash = async (exampleId: string, frame: number, asset?: AssetRef): Promise<string> => {
  const assets: ResolvedSceneAssets | undefined = asset ? { assetRequirement: asset } : undefined;
  return hashStill(
    await harness.still(
      `character-explainer--${exampleId}`,
      {
        capabilityId: 'character_explainer',
        exampleId,
        layout: null,
        motionProfile: null,
        ...(assets ? { assets } : {}),
      },
      frame,
    ),
  );
};

describe('CharacterExplainerScene runtime', () => {
  it('renders every asset state, and degrades placeholder and failed identically', async () => {
    const [ready, placeholder, failed] = await Promise.all([
      renderHash(CANONICAL_EXAMPLE_ID, SETTLED_FRAME, PORTRAIT_READY),
      renderHash(CANONICAL_EXAMPLE_ID, SETTLED_FRAME, PLACEHOLDER_ASSET),
      renderHash(CANONICAL_EXAMPLE_ID, SETTLED_FRAME, FAILED_ASSET),
    ]);

    expect(placeholder).toBe(failed);
    expect(ready).not.toBe(placeholder);
  }, 120_000);

  /**
   * The committed evaluation PNG, through the whole loop: the resolver, the `staticFile`
   * territory, the bundle's copy of `public/` and the browser's image decode. A broken
   * link anywhere in that chain fails the render rather than passing silently.
   */
  it('resolves the canonical example through the repository library without an override', async () => {
    const [resolved, placeholder] = await Promise.all([
      renderHash(CANONICAL_EXAMPLE_ID, SETTLED_FRAME),
      renderHash(CANONICAL_EXAMPLE_ID, SETTLED_FRAME, PLACEHOLDER_ASSET),
    ]);

    expect(resolved).not.toBe(placeholder);
  }, 120_000);

  /**
   * Both halves of the driven example's independence, plus the relation that makes the
   * entrances enhancements rather than different scenes.
   *
   * Unequal inside the hold would fail if `revealCharacter` never reached the frame —
   * the held half is the copy column standing alone. And **unequal at rest would mean
   * the plan left something permanently behind**: an eventless instance and one whose
   * reveals have completed have to end on the same composition, which is what the
   * ambient drift being phased on the scene's clock buys.
   */
  it('holds the character while the copy stands, and comes to rest on the eventless frame', async () => {
    const [heldDriven, heldCanonical, restedDriven, restedCanonical] = await Promise.all([
      renderHash('example-explainer-driven', HOLD_FRAME),
      renderHash(CANONICAL_EXAMPLE_ID, HOLD_FRAME),
      renderHash('example-explainer-driven', SETTLED_FRAME),
      renderHash(CANONICAL_EXAMPLE_ID, SETTLED_FRAME),
    ]);

    expect(heldDriven).not.toBe(heldCanonical);
    expect(restedDriven).toBe(restedCanonical);
  }, 120_000);

  it('keeps a ready portrait and a ready square cutout distinct from each other and from the plate', async () => {
    const [portrait, square, placeholder] = await Promise.all([
      renderHash(CANONICAL_EXAMPLE_ID, SETTLED_FRAME, PORTRAIT_READY),
      renderHash(CANONICAL_EXAMPLE_ID, SETTLED_FRAME, SQUARE_READY),
      renderHash(CANONICAL_EXAMPLE_ID, SETTLED_FRAME, PLACEHOLDER_ASSET),
    ]);

    expect(portrait).not.toBe(square);
    expect(portrait).not.toBe(placeholder);
    expect(square).not.toBe(placeholder);
  }, 120_000);

  /**
   * The designed empty state, as a relation against the bare ground: the pending note
   * and the subject plate have to put ink on a frame the backdrop alone would leave
   * empty, and the empty copy has to differ from the canonical copy rather than
   * collapsing into the same composition.
   */
  it('renders the empty-copy state as a designed, non-blank frame', async () => {
    const [empty, canonical, ground] = await Promise.all([
      renderHash('example-explainer-empty', SETTLED_FRAME),
      renderHash(CANONICAL_EXAMPLE_ID, SETTLED_FRAME),
      hashStill(await harness.still('control--backdrop', {}, 0)),
    ]);

    expect(empty).not.toBe(canonical);
    expect(empty).not.toBe(ground);
  }, 120_000);

  it('renders the same frame and inputs identically twice', async () => {
    const [first, second] = await Promise.all([
      renderHash('example-explainer-driven', ACCENT_PEAK_FRAME),
      renderHash('example-explainer-driven', ACCENT_PEAK_FRAME),
    ]);

    expect(first).toBe(second);
  }, 120_000);

  it('keeps the accepted key frames stable', async () => {
    const [entrance, settled, accentPeak, square, edge, empty] = await Promise.all([
      renderHash(CANONICAL_EXAMPLE_ID, ENTRANCE_FRAME),
      renderHash(CANONICAL_EXAMPLE_ID, SETTLED_FRAME),
      renderHash('example-explainer-driven', ACCENT_PEAK_FRAME),
      renderHash(CANONICAL_EXAMPLE_ID, SETTLED_FRAME, SQUARE_READY),
      renderHash('example-explainer-long', SETTLED_FRAME),
      renderHash('example-explainer-empty', SETTLED_FRAME),
    ]);

    expect({ entrance, settled, accentPeak, square, edge, empty }).toEqual({
      // Accepted 2026-08-23, the first key frames for this capability. Reviewed on stills
      // at the frames named above, on `editorial-paper`, and the stills' own md5s match
      // these hashes — the script and the suite render the same bytes:
      //
      //   entrance  — the educator mid-wipe, clipped at the top of the head and standing
      //     at entrance scale, the label already up and the headline rising behind it.
      //     This is the picture the default entrance produces before the plan holds it.
      //   settled   — the figure fully contained — head, hands and open gesture intact —
      //     on the restrained halo and ground shadow, the copy column carrying the
      //     eyebrow, the headline and the explanation. Nothing touches a frame edge.
      //   accentPeak — the same figure at the accent's peak: halo brighter and larger,
      //     cutout a touch scaled and tilted, copy untouched. This is the picture
      //     `accentCharacter` exists to produce, mid-window.
      //   square     — the square stand-in fully contained and bottom-aligned inside the
      //     same character allowance: head and both shoulders visible, no stretching or
      //     contact with the live-frame edge. This is the accepted square regime.
      //   edge      — copy at the schema's own ceilings: a two-line label, a headline
      //     stepped down the scale onto five lines, a five-line paragraph, all legible
      //     and all inside the column, the figure unchanged beside them.
      //   empty     — no authored copy at all: the honest subject plate on the left and
      //     the EXPLANATION PENDING note over its rule on the right. Degraded to a
      //     designed state, never to a blank frame.
      entrance: '2d915750f313a126f8efa40c429ef11a',
      settled: '064e465b1e7e3ce67f697d91e17509d8',
      accentPeak: 'e99d05c335e32088b149db760442f85b',
      square: '4ee77487b1effb4bd319d0d6ed5a0cc8',
      edge: 'd91faf345ad26260d6db91861afa780a',
      empty: '1ccb2809080c0fa9c65883115389d112',
    });
  }, 120_000);
});

/**
 * The take's half, which no example can carry — `examples.ts` says why.
 *
 * The only way to render the accent against real onsets is to compile a plan and play
 * the document. The beats below are the typographic suite's, so the two suites share a
 * fixture rather than a second copy of the same timings drifting beside it.
 */
describe('the accent against a recorded take', () => {
  const beats: TimedBeat[] = [
    {
      id: 'b7',
      text: 'Nobody is left to absorb the difference.',
      fromMs: 0,
      toMs: 5000,
      words: ['Nobody', 'is', 'left', 'to', 'absorb', 'the', 'difference'].map((text, index) => ({
        text,
        fromMs: 2000 + index * 400,
      })),
    },
    {
      id: 'b8',
      text: 'What follows is an account of who pays instead.',
      fromMs: 5000,
      toMs: 8000,
      words: ['What', 'follows', 'is', 'an', 'account', 'of', 'who', 'pays', 'instead'].map(
        (text, index) => ({ text, fromMs: 5000 + index * 300 }),
      ),
    },
  ];

  /** "absorb" is 3600ms, which is frame 108 at 30fps. */
  const ON_ABSORB = 108;
  const AFTER_ABSORB = 111;
  const PAST_THE_WINDOW = 200;

  const planWith = (
    events: NonNullable<VideoPlan['sections'][number]['scenes'][number]['events']>,
  ): VideoPlan => ({
    beats: beats.map(({ id, text }) => ({ id, text })),
    sections: [
      {
        id: 'act-two',
        spansBeats: ['b7', 'b8'],
        scenes: [
          {
            id: 'explainer',
            component: 'character_explainer',
            layout: 'sideBySide',
            motionProfile: 'editorialStatic',
            spansBeats: ['b7', 'b8'],
            props: {
              label: 'Housing educator',
              headline: 'Somebody has to absorb the difference',
              explanation: 'The account below is of who pays instead.',
              assetRequirement: {
                type: 'character',
                subject: 'Original editorial educator with an open explanatory gesture',
                treatment: 'illustration',
                orientation: 'portrait',
                identityKey: 'character-explainer-reference',
              },
            },
            events,
          },
        ],
      },
    ],
  });

  const compilePlan = (plan: VideoPlan): CompiledDocument => {
    const result = compile({ plan, beats });
    if (!result.ok) {
      throw new Error(`fixture plan did not compile: ${JSON.stringify(result.report)}`);
    }
    return result.document;
  };

  const renderDocument = async (document: CompiledDocument, frame: number): Promise<string> =>
    hashStill(await harness.still('compiled-document', { document }, frame));

  /**
   * The word anchor, proven as a relation against the same plan with the accent
   * removed. The figure has ambient life, so adjacent frames differ for reasons that
   * have nothing to do with the word — an un-anchored control would pass for the wrong
   * reason. Comparing *with* against *without* at the same frame removes every other
   * variable, ambient drift included.
   *
   * Equal on the onset frame is the eased start: the envelope is still zero at frame
   * 108, so the pulse begins from the settled state rather than jumping. And it pins
   * the anchor itself — had the event resolved a second earlier, frame 108 would already
   * be inside the window and the two plans would differ there. Unequal three frames
   * later is the pulse becoming visible.
   */
  it('begins the accent on the measured onset, and on nothing else', async () => {
    const withAccent = compilePlan(
      planWith([
        { at: 'b7.start', action: 'revealCharacter' },
        { at: 'b7.word:absorb', action: 'accentCharacter' },
      ]),
    );
    const withoutAccent = compilePlan(planWith([{ at: 'b7.start', action: 'revealCharacter' }]));

    const [onWith, onWithout, afterWith, afterWithout] = await Promise.all([
      renderDocument(withAccent, ON_ABSORB),
      renderDocument(withoutAccent, ON_ABSORB),
      renderDocument(withAccent, AFTER_ABSORB),
      renderDocument(withoutAccent, AFTER_ABSORB),
    ]);

    expect(onWith).toBe(onWithout);
    expect(afterWith).not.toBe(afterWithout);
  }, 120_000);

  /**
   * The "returns to rest" half of the accent contract, as a relation against the same
   * plan with the accent removed: equal after the window would fail if any residual
   * scale, tilt or halo survived the gesture, and unequal at the peak is the control
   * that says the accent was ever visible at all.
   */
  it('returns to the settled frame once the accent window has passed', async () => {
    const withAccent = compilePlan(
      planWith([
        { at: 'b7.start', action: 'revealCharacter' },
        { at: 'b7.word:absorb', action: 'accentCharacter' },
      ]),
    );
    const withoutAccent = compilePlan(planWith([{ at: 'b7.start', action: 'revealCharacter' }]));

    const [peakWith, peakWithout, pastWith, pastWithout] = await Promise.all([
      renderDocument(withAccent, 128),
      renderDocument(withoutAccent, 128),
      renderDocument(withAccent, PAST_THE_WINDOW),
      renderDocument(withoutAccent, PAST_THE_WINDOW),
    ]);

    expect(peakWith).not.toBe(peakWithout);
    expect(pastWith).toBe(pastWithout);
  }, 120_000);

  /**
   * The other direction of the independence the driven example cannot show: the copy
   * held back while the character — undriven by any reveal of its own — stands on the
   * frame. Compared against the same plan with the late reveal removed, so the one
   * variable is the copy's absence.
   */
  it('holds the copy back while the independently undriven character stands', async () => {
    const lateCopy = compilePlan(
      planWith([
        { at: 'b7.start', action: 'revealCharacter' },
        { at: 'b8.start', action: 'revealCopy' },
      ]),
    );
    const openCopy = compilePlan(planWith([{ at: 'b7.start', action: 'revealCharacter' }]));

    const [held, standing] = await Promise.all([
      renderDocument(lateCopy, 120),
      renderDocument(openCopy, 120),
    ]);

    expect(held).not.toBe(standing);
  }, 120_000);
});
