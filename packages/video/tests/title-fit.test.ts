/**
 * The rule that stops a headline being clipped.
 *
 * Written after a real one was: "Northbridge before dawn" rendered as "Northbridg" in the
 * opening scene of the shipped Northbridge preview, because `titleStep` sizes type from
 * character count and a single unbreakable word can be wider than its column at that size.
 * Nothing caught it — the frame stays well inside its safe area, so the render contract
 * suite reads clean backdrop everywhere it looks, and the three `image_context` examples
 * all happen to have short words.
 *
 * These tests use a ruler rather than a browser. The real one is `measureText`, whose
 * accuracy is Remotion's problem and is exercised end to end by the rendered frame; what
 * is worth pinning here is the *decision* — that it steps down until the widest word fits,
 * never above the ceiling it was given, and never past the floor.
 */
import { describe, expect, it } from 'vitest';
import { editorialPaper } from '../src/design/theme';
import { TITLE_MIN_STEP, fitTitleStep, titleStep } from '../src/primitives/titleFit';

/**
 * A ruler with one glyph width: `perChar` px per character at step 5, scaled by the real
 * type scale. Linear and boring on purpose — a fake that modelled kerning would be
 * testing itself.
 */
const ruler =
  (perChar: number) =>
  (word: string, step: number): number => {
    const scale = editorialPaper.type.scale;
    const ratio = (scale[step] as number) / (scale[5] as number);
    return word.length * perChar * ratio;
  };

const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);

describe('fitTitleStep', () => {
  it('keeps the ceiling when the widest word already fits', () => {
    const step = fitTitleStep({
      words: wordsOf('Weekday boardings'),
      top: 5,
      available: 2000,
      widthAt: ruler(60),
    });

    expect(step).toBe(5);
  });

  it('steps down until the widest word fits, and no further', () => {
    // "Northbridge" is 11 chars at 60px/char = 660 at step 5, 484 at step 4 (88/120).
    const words = wordsOf('Northbridge before dawn');
    const widthAt = ruler(60);

    const step = fitTitleStep({ words, top: 5, available: 560, widthAt });

    expect(step).toBe(4);
    expect(widthAt('Northbridge', step)).toBeLessThanOrEqual(560);
    // The step above it genuinely did not fit, so this is the largest one that does.
    expect(widthAt('Northbridge', step + 1)).toBeGreaterThan(560);
  });

  it('is bounded by the ceiling it was given, never raising a title to fit', () => {
    const step = fitTitleStep({
      words: wordsOf('Pilot budget and spending'),
      top: 3,
      available: 10_000,
      widthAt: ruler(60),
    });

    expect(step).toBe(3);
  });

  it('stops at the floor rather than shrinking a headline into a caption', () => {
    const step = fitTitleStep({
      words: ['Antidisestablishmentarianism'],
      top: 5,
      available: 1,
      widthAt: ruler(60),
    });

    expect(step).toBe(TITLE_MIN_STEP);
  });

  it('measures the widest word and not the first or the longest string', () => {
    // The first word is short and the widest is in the middle, so a rule that read either
    // the first word or the whole string would come back with a different answer.
    const widthAt = ruler(60);
    const step = fitTitleStep({
      words: wordsOf('The reconfiguration is done'),
      top: 5,
      available: 620,
      widthAt,
    });

    expect(widthAt('reconfiguration', step)).toBeLessThanOrEqual(620);
    expect(step).toBeLessThan(5);
  });

  it('leaves an empty or unmeasurable box alone rather than collapsing to the floor', () => {
    // A box of zero width is a frame mid-layout, not a headline that cannot fit. Stepping
    // down on it would make the title jump on the first frame that has real geometry.
    expect(fitTitleStep({ words: ['Anything'], top: 5, available: 0, widthAt: ruler(60) })).toBe(5);
    expect(fitTitleStep({ words: [], top: 4, available: 500, widthAt: ruler(60) })).toBe(4);
  });
});

describe('titleStep', () => {
  it('reads length only, which is the ceiling it is meant to be', () => {
    expect(titleStep(10)).toBe(5);
    expect(titleStep(40)).toBe(5);
    expect(titleStep(41)).toBe(4);
    expect(titleStep(70)).toBe(4);
    expect(titleStep(71)).toBe(3);
  });
});
