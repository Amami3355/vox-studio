/**
 * Runtime integration for `typographic_statement`, at the public render boundary.
 *
 * Three different questions, deliberately kept apart, on the `quote.test.ts` pattern.
 *
 * The first two state a plan's effect as a *relation* between hashes, so they keep meaning
 * something on a machine whose font rendering differs. The third is the key-frame baseline:
 * literal hashes, accepted after visual review, and the suite that is expected to fail when
 * the design changes on purpose.
 *
 * The compiled-plan case at the foot is the only place the sweep is proven on pixels rather
 * than on frame numbers. Everything the compiler decides about a word anchor is asserted as
 * data in `tests/compile.test.ts`; what a browser adds is that the frame actually changes
 * when the voice reaches the word — and it is asked with a control, because two frames of a
 * scene that is still settling differ for reasons that have nothing to do with the word.
 */
import { describe, expect, it } from 'vitest';
import type { VideoPlan } from '../../src/catalog/validate';
import { compile } from '../../src/compile';
import type { CompiledDocument } from '../../src/compile/document';
import type { TimedBeat } from '../../src/core/types';
import { hashStill, renderHarness } from './harness';

/**
 * Frames in the examples, which all run 120.
 *
 * The driven example holds until `b1.start+short` and sweeps its last word in at
 * `b3.start+long`, so these three are the only places its three states are visible: the
 * eyebrow alone, the sweep in progress, and the card at rest.
 */
const HOLD_FRAME = 6;
const SWEEP_FRAME = 60;
const SETTLED_FRAME = 118;

const harness = renderHarness();

const renderHash = async (exampleId: string, frame: number): Promise<string> =>
  hashStill(
    await harness.still(
      `typographic-statement--${exampleId}`,
      { capabilityId: 'typographic_statement', exampleId, layout: null, motionProfile: null },
      frame,
    ),
  );

describe('TypographicStatementScene runtime', () => {
  /**
   * Both verbs, stated as relations against the one example that differs from the driven
   * one only in its events.
   *
   * All three directions matter. Equal inside the hold would mean `revealStatement` never
   * reached the frame. Equal mid-sweep would mean `advanceWord` never did. And **unequal at
   * rest would mean the plan left something permanently behind** — a card that was swept
   * and a card that never was have to end on the same frame, because that is what makes the
   * sweep an enhancement a plan can lose without losing the shot.
   */
  it('holds the statement, sweeps it, and comes to rest on the undriven frame', async () => {
    const [heldDriven, heldCanonical, sweptDriven, sweptCanonical, restedDriven, restedCanonical] =
      await Promise.all([
        renderHash('example-statement-driven', HOLD_FRAME),
        renderHash('example-statement-canonical', HOLD_FRAME),
        renderHash('example-statement-driven', SWEEP_FRAME),
        renderHash('example-statement-canonical', SWEEP_FRAME),
        renderHash('example-statement-driven', SETTLED_FRAME),
        renderHash('example-statement-canonical', SETTLED_FRAME),
      ]);

    expect(heldDriven).not.toBe(heldCanonical);
    expect(sweptDriven).not.toBe(sweptCanonical);
    expect(restedDriven).toBe(restedCanonical);
  }, 120_000);

  it('keeps the accepted key frames stable', async () => {
    const [canonical, longCopy, empty, held, swept] = await Promise.all([
      renderHash('example-statement-canonical', SETTLED_FRAME),
      renderHash('example-statement-long', SETTLED_FRAME),
      renderHash('example-statement-empty', SETTLED_FRAME),
      renderHash('example-statement-driven', HOLD_FRAME),
      renderHash('example-statement-driven', SWEEP_FRAME),
    ]);

    expect({ canonical, longCopy, empty, held, swept }).toEqual({
      // Accepted 2026-08-22, the first key frames for this capability, and re-accepted the same
      // day after code review moved the ordinal and the empty-state label to full knock (see
      // `cutGeometry.unspokenMix`). Reviewed on stills at
      // the frames named above, on `editorial-paper`:
      //
      //   canonical — the accent taken to full bleed, the eyebrow and the statement knocked
      //     out of it in Instrument Serif at the top of the scale, two lines, and the
      //     ordinal small in mono in the bottom corner.
      //   longCopy  — the same card on the `negative` ground, the fit having taken the
      //     statement down the scale to four lines. Nothing near the ordinal or the border.
      //   empty     — a faint rule and STATEMENT PENDING in full knock, and nothing else,
      //     because this example carries an empty eyebrow and ordinal too. Degraded
      //     typographically, never to black and never to unreadable ink on a hot ground:
      //     the label is 26px at the density floor, so it is held to 4.5:1 and not to the
      //     3:1 the sweep's recessive tone clears.
      //   held      — the eyebrow and the ordinal alone on the ground, mid-entrance. This is
      //     the picture `revealStatement` exists to produce.
      //   swept     — "Nobody is" in full, "left" carrying the mark, and the rest of the
      //     sentence recessive but still legible. This is the picture `advanceWord` exists
      //     to produce, and the reason the recession is a mix rather than a fade.
      canonical: 'f0577ec9e3209bc3e4569f5e420f8f1e',
      longCopy: '33e41cb24bd5eb26456adb4c14c15f83',
      empty: '1e011f825a1561736d461ea731eca49b',
      held: '311836b94badebaf10fa414cade89fe9',
      swept: '14dbef1ec41309130451ae2f4906ae17',
    });
  }, 120_000);
});

/**
 * The take's half, which no example can carry — `examples.ts` says why.
 *
 * The only way to render the sweep against real onsets is to compile a plan and play the
 * document, which is what `compiled-video.test.ts` does for ADR-0003 and what this does for
 * the word anchor.
 */
describe('the sweep against a recorded take', () => {
  /**
   * Onsets deliberately late in the beat. The statement's entrance is a spring, and two
   * frames taken while it is still settling differ whatever the words do — an assertion
   * that would pass for the wrong reason. Every word here lands after frame 60, by which
   * time the entrance that began at frame 4 is long over, and the quiet control below
   * proves it rather than assuming it.
   */
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
  const QUIET_FRAME = 99;
  const BEFORE_ABSORB = 105;
  const AFTER_ABSORB = 111;

  const planWith = (emphasis: string): VideoPlan => ({
    beats: beats.map(({ id, text }) => ({ id, text })),
    sections: [
      {
        id: 'act-two',
        spansBeats: ['b7', 'b8'],
        scenes: [
          {
            id: 'card',
            component: 'typographic_statement',
            layout: 'cut',
            motionProfile: 'editorialStatic',
            spansBeats: ['b7', 'b8'],
            props: {
              eyebrow: 'Chapter two',
              statement: 'Nobody is left to absorb the difference',
              ordinal: '02 / 05',
              emphasis,
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
  });

  const documentFor = (emphasis: string): CompiledDocument => {
    const result = compile({ plan: planWith(emphasis), beats });
    if (!result.ok) {
      throw new Error(`fixture plan did not compile: ${JSON.stringify(result.report)}`);
    }
    return result.document;
  };

  const renderDocument = async (document: CompiledDocument, frame: number): Promise<string> =>
    hashStill(await harness.still('compiled-document', { document }, frame));

  it('changes the frame on the onset the take measured, and on nothing else', async () => {
    const document = documentFor('neutral');
    const [quiet, before, after] = await Promise.all([
      renderDocument(document, QUIET_FRAME),
      renderDocument(document, BEFORE_ABSORB),
      renderDocument(document, AFTER_ABSORB),
    ]);

    // The control: nothing is spoken between these two, and the card is already at rest.
    expect(quiet).toBe(before);
    // The claim: the only thing that happened between these two is the word "absorb".
    expect(after).not.toBe(before);
  }, 120_000);

  /**
   * The ground, as a relation. Two plans identical but for a semantic role must not produce
   * the same frame, which is the whole of what `emphasis` promises — and it is asked here
   * rather than of two examples, because two examples differing only in a role would be a
   * shape the agent is being taught to author for no editorial reason.
   */
  it('paints a different ground for a different emphasis role', async () => {
    const [neutral, negative] = await Promise.all([
      renderDocument(documentFor('neutral'), AFTER_ABSORB),
      renderDocument(documentFor('negative'), AFTER_ABSORB),
    ]);

    expect(neutral).not.toBe(negative);
  }, 120_000);
});
