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
import {
  MAX_HEADER_SHARE,
  TITLE_LINE_HEIGHT,
  TITLE_MIN_STEP,
  fitTitleStep,
  titleStep,
  wrappedLineCount,
} from '../src/primitives/titleFit';

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

/** One line's height at a step, on the same scale the ruler measures against. */
const leadingAt = (step: number): number =>
  (editorialPaper.type.scale[step] as number) * TITLE_LINE_HEIGHT;

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

describe('wrappedLineCount', () => {
  it('takes words while they fit and breaks where they do not', () => {
    // 60px a word at step 5 (`ruler` is per character, and these are five characters
    // each), so a 200px measure carries three words and their two spaces.
    const lines = wrappedLineCount({
      words: ['rents', 'again', 'rents', 'again', 'rents'],
      step: 5,
      available: 200,
      widthAt: ruler(10),
    });

    expect(lines).toBe(2);
  });

  it('sets fewer lines as the step drops, which is what makes the fit converge', () => {
    const words = wordsOf('rents in the northern cities climbed again this year');
    const at = (step: number) =>
      wrappedLineCount({ words, step, available: 600, widthAt: ruler(20) });

    expect(at(3)).toBeLessThan(at(5));
    expect(at(2)).toBeLessThanOrEqual(at(3));
  });

  it('counts a single word as one line however wide it is', () => {
    // A word cannot wrap, so it is one line and a width problem — which is the other
    // half of the fit's job, not this one's.
    expect(
      wrappedLineCount({ words: ['householders'], step: 5, available: 1, widthAt: ruler(60) }),
    ).toBe(1);
  });

  it('says nothing about an empty string or an unmeasurable box', () => {
    expect(wrappedLineCount({ words: [], step: 5, available: 500, widthAt: ruler(10) })).toBe(0);
    expect(wrappedLineCount({ words: ['a', 'b'], step: 5, available: 0, widthAt: ruler(10) })).toBe(
      1,
    );
  });
});

describe('fitTitleStep under a height budget', () => {
  /** The height a title of `lines` lines takes at `step`, as the fit computes it. */
  const heightOf = (lines: number, step: number) => lines * leadingAt(step);

  it('steps down until the string fits its budget, not only until its widest word fits', () => {
    // The longest word is ten characters — 120px at step 5, comfortably inside a 250px
    // column — so the width fit alone leaves the title at 5. It is the height that moves it.
    const words = wordsOf(
      'rents in the northern cities climbed again this year and households already spending',
    );
    const widthAt = ruler(12);
    const available = 250;
    const maxHeight = heightOf(4, 5);

    const wide = fitTitleStep({ words, top: 5, available, widthAt });
    const budgeted = fitTitleStep({
      words,
      top: 5,
      available,
      widthAt,
      maxHeight,
      lineHeightAt: leadingAt,
    });

    expect(wide).toBe(5);
    expect(budgeted).toBeLessThan(wide);
    expect(
      wrappedLineCount({ words, step: budgeted, available, widthAt }) * leadingAt(budgeted),
    ).toBeLessThanOrEqual(maxHeight);
  });

  it('re-asks the budget at every rung, because a line is not a fixed amount of room', () => {
    // The whole reason the budget is a height. Six lines at step 2 are shorter than three
    // at step 5, so a rule counting lines would reject the smaller of the two frames.
    expect(heightOf(6, 2)).toBeLessThan(heightOf(3, 5));
  });

  it('leaves a title that already fits its budget alone', () => {
    const words = wordsOf('Weekday boardings');

    expect(
      fitTitleStep({
        words,
        top: 5,
        available: 2000,
        widthAt: ruler(20),
        maxHeight: heightOf(4, 5),
        lineHeightAt: leadingAt,
      }),
    ).toBe(5);
  });

  it('stops at the floor rather than shrinking display type into a caption', () => {
    // A budget no step can meet bottoms the fit out instead of inventing a size below the
    // floor. Display type shrunk into a caption is not a better failure than a header a
    // little over its share.
    const words = wordsOf('rents in the northern cities climbed again this year and '.repeat(4));

    expect(
      fitTitleStep({
        words,
        top: 5,
        available: 400,
        widthAt: ruler(20),
        maxHeight: 1,
        lineHeightAt: leadingAt,
      }),
    ).toBe(TITLE_MIN_STEP);
  });

  it('applies both constraints, landing where each is satisfied', () => {
    // A long string of one very wide word and many narrow ones: the two questions bottom
    // out at different rungs, and the answer has to satisfy the later of them.
    const words = wordsOf('antidisestablishmentarianism in the northern cities again this year');
    const widthAt = ruler(14);
    const available = 900;
    const maxHeight = heightOf(3, 4);

    const step = fitTitleStep({
      words,
      top: 5,
      available,
      widthAt,
      maxHeight,
      lineHeightAt: leadingAt,
    });

    expect(widthAt('antidisestablishmentarianism', step)).toBeLessThanOrEqual(available);
    expect(
      wrappedLineCount({ words, step, available, widthAt }) * leadingAt(step),
    ).toBeLessThanOrEqual(maxHeight);
  });

  it('ignores a budget it was given no leading to measure against', () => {
    // Both or neither: a height with no way to turn steps into pixels is a caller error,
    // and silently guessing a leading would make the fit disagree with what is drawn.
    const words = wordsOf('rents in the northern cities climbed again');

    expect(fitTitleStep({ words, top: 5, available: 250, widthAt: ruler(12), maxHeight: 1 })).toBe(
      5,
    );
  });
});
describe('MAX_HEADER_SHARE', () => {
  it('is the point past which a header is the larger half of its own scene', () => {
    // The one statement about a header's height that stands on its own.
    // `runtime/StressControl.tsx` imports this rather than restating it.
    expect(MAX_HEADER_SHARE).toBeCloseTo(1 / 2);
  });

  it('clears the frames a human accepted, which is what argued it down from a third', () => {
    // `example-housing-context` is the canonical frame of `image_context` and its headline
    // is 42% of its scene — beside a plate, with a two-line caption under it, crowding out
    // nothing. A third rejected it. The content-stress ceilings sit far below either.
    expect(425 / 1008).toBeLessThan(MAX_HEADER_SHARE);
    expect(178 / 816).toBeLessThan(MAX_HEADER_SHARE);
    expect(214 / 1008).toBeLessThan(MAX_HEADER_SHARE);
  });

  it('does not pretend to catch the ranking, which a region check catches properly', () => {
    // The failure in `barChartGeometry`'s note — a 68-character title over nine rows, five
    // lines at 63px — is 39% of its box, *below* the good frame above. No share separates
    // them, so this one does not try: the harm there was rows running off the canvas, and
    // the quiet border measures that directly rather than through a proxy.
    expect((5 * 63) / 816).toBeLessThan(MAX_HEADER_SHARE);
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
