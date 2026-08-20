/**
 * Choosing a title's step on the type scale.
 *
 * Two decisions live here and they answer different questions. `titleStep` reads the
 * string and says how loud a headline of that length should be. `fitTitleStep` reads the
 * box and says how loud it is allowed to be. The first is editorial, the second is
 * physical, and the second always wins.
 *
 * Split from the component so the physical half can be tested without a browser: the
 * measurement is a dependency of the decision rather than part of it, which is what lets a
 * unit test hand it a ruler that lies in a known way. `useTitleStep` is the only caller
 * that supplies the real one.
 */
import { measureText } from '@remotion/layout-utils';
import { useMemo } from 'react';
import { useDensity, useTheme } from './ThemeContext';

/**
 * Title step, degrading silently on long strings.
 *
 * The soft limit is 40 characters. Beyond it the scale drops a step rather than letting
 * the title wrap into the chart or overflow the frame.
 *
 * Length is the whole story for *height* and only half of it for width: a string wraps,
 * but a single word cannot, so this ladder is a ceiling and never a guarantee.
 */
export const titleStep = (length: number): number => {
  if (length <= 40) return 5;
  if (length <= 70) return 4;
  return 3;
};

/** Share of its column a title is allowed to occupy. `SceneTitle` applies the same figure. */
export const TITLE_MAX_WIDTH = 0.86;

/**
 * The share of its scene's height a header may take before it has eaten that scene.
 *
 * **It is a rule about headers**, and the word is load-bearing: a header sits above other
 * content and its job includes leaving room for it, so there is something for it to eat.
 * Display type that *is* the scene — a pull-quote, a typographic statement — has nothing
 * below it to crowd out, and the only ceiling that means anything for it is the box it was
 * given. `SceneTitle`'s `displayRole` is where a scene says which of the two it is drawing.
 *
 * **A height and not a line count.** This file's own sentence says five lines, and five
 * lines was a faithful proxy for the harm at the step the harm happened at: the ranking
 * that provoked it set a 68-character title at 63px, which is 321px of a composed box, and
 * the nine rows underneath ran off the canvas. The same five lines *after* the length
 * ladder and the composed drop have done their work are 178px and 16% of the frame, with
 * the chart below them untouched. A count cannot tell those two apart; a height can.
 *
 * **A half, and the number was argued down from a third by the frames themselves.** A third
 * looked principled — two thirds left for what the header labels — and it failed
 * `example-housing-context`, whose headline is 42% of its scene and which a human had
 * accepted as the canonical frame of this capability. It is a good frame: the headline sits
 * beside a plate with a two-line caption under it and crowds out nothing. So a third is not
 * where 'leaves room for it' stops being true, and no threshold is — the ranking that
 * started all this was 39%, *below* the good frame, so a share cannot separate them and any
 * number that tried would have been tuned to a pair of stills.
 *
 * A half is the one statement that stands on its own: a header past it is the larger half of
 * its own scene, which is what 'eaten' means. It is deliberately a coarse backstop. **It does
 * not catch the 39% ranking, and it does not need to** — that failure was the rows running
 * off the canvas, which is what `safe-area.test.ts` and the content-stress suite's quiet
 * border measure directly, and measure without a proxy. This session watched that path catch
 * the same shape of failure twice.
 *
 * Lives here rather than in the check that reads it: `runtime/StressControl.tsx` used to
 * restate the number, and a second copy of a rule is the copy that goes stale — the same
 * argument `tests/stress/cases.ts` makes for deriving its cases from the schema rather
 * than from a fixture.
 */
export const MAX_HEADER_SHARE = 1 / 2;

/**
 * The leading a fitted title is set at. `SceneTitle` applies it and the fit predicts with
 * it, so the height the fit computes is the height the browser draws.
 */
export const TITLE_LINE_HEIGHT = 1.02;

/**
 * Below this step a headline has stopped being a headline.
 *
 * The same judgement as `barChartGeometry.minCategories`: if a column cannot hold the
 * longest word at 48px, the honest outcome is a word that touches its margins, not display
 * type shrunk into a caption. Clipping is what this exists to prevent; disappearing is not
 * a better failure.
 */
export const TITLE_MIN_STEP = 2;

/**
 * The step ceiling a title takes when its scene has been composed into half a frame.
 *
 * A composed scene shares the canvas with a persistent element, so it sets quieter than
 * the length ladder would give it on a frame of its own: `drop` rungs below `titleStep`,
 * floored at `TITLE_MIN_STEP` for the same reason `fitTitleStep` floors there — display
 * type shrunk into a caption is not a better failure than a word that touches its margins.
 *
 * A ceiling and never the answer: the width fit still runs underneath it, which is what
 * answers the narrower column. Three scenes make this move — `BarChartScene` for its
 * title, `QuoteScene` for the quote, `StatCounterScene` for the label — each with its own
 * `drop` in its `layouts.ts`, so the arithmetic and the floor live here once rather than
 * three times over.
 */
export const composedStepCeiling = (length: number, drop: number): number =>
  Math.max(TITLE_MIN_STEP, titleStep(length) - drop);

/**
 * How many lines `words` set at `step` inside `available`, by greedy wrap.
 *
 * The browser's own algorithm, restated — take words while they fit, break where they do
 * not. It has to be restated because the answer is needed *while rendering*, in order to
 * choose a size, and the browser only knows it after the layout that size decides.
 *
 * Measured on whole candidate lines rather than summed from word widths, because the
 * width of `a b` is not the width of `a` plus the width of `b`: the space and the tracking
 * are set between them, and a sum drifts by a character or two per line — which is exactly
 * the margin the fit is deciding on.
 */
export const wrappedLineCount = ({
  words,
  step,
  available,
  widthAt,
}: {
  words: string[];
  step: number;
  available: number;
  widthAt: (text: string, step: number) => number;
}): number => {
  if (words.length === 0) return 0;
  /** An unmeasurable box is a frame mid-layout, not a string that set one line. */
  if (available <= 0) return 1;

  let lines = 1;
  let line = words[0] as string;
  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`;
    if (widthAt(candidate, step) <= available) {
      line = candidate;
    } else {
      lines += 1;
      line = word;
    }
  }
  return lines;
};

/**
 * The largest step at or below `top` at which the title fits the column it is in.
 *
 * Two questions, and one number has to answer both. **Width**: only the widest word
 * constrains it, because a string wraps and a word does not — found once at `top` and
 * re-measured as the step drops, since which word is widest cannot change with size when
 * the whole string scales together. **Height**: how many lines the string wraps into,
 * which needs the whole string and not its widest word.
 *
 * The height half is what the content-stress suite went looking for. Width alone let a
 * 120-character headline set five lines down a composed column and eight down a 5/12 one —
 * every one of them inside its safe area, none of them clipped: legal, unreadable, and
 * invisible to every check that reads pixels. `maxHeight` is the fact the layout has and
 * the string does not, which is how much vertical room this type was given.
 *
 * In px and not in lines, because a line is not a fixed amount of room: the same five lines
 * are 39% of a composed box at one step and 16% at the floor, and only one of those is a
 * header eating its scene. The budget therefore has to be re-asked at every rung, which is
 * what `lineHeightAt` is for.
 *
 * `widthAt` and `lineHeightAt` are injected rather than imported so this stays a pure
 * function of its inputs.
 */
export const fitTitleStep = ({
  words,
  top,
  available,
  widthAt,
  minStep = TITLE_MIN_STEP,
  maxHeight,
  lineHeightAt,
}: {
  words: string[];
  top: number;
  available: number;
  widthAt: (text: string, step: number) => number;
  minStep?: number;
  /** Px this type may take before it has outgrown its room. Unbounded when absent. */
  maxHeight?: number;
  /** The height of one line at a given step. Required whenever `maxHeight` is given. */
  lineHeightAt?: (step: number) => number;
}): number => {
  if (words.length === 0 || available <= 0) return top;

  let widest = words[0] as string;
  let widestWidth = widthAt(widest, top);
  for (const word of words.slice(1)) {
    const w = widthAt(word, top);
    if (w > widestWidth) {
      widest = word;
      widestWidth = w;
    }
  }

  const tooWide = (step: number): boolean => widthAt(widest, step) > available;
  const tooTall = (step: number): boolean =>
    maxHeight !== undefined &&
    lineHeightAt !== undefined &&
    wrappedLineCount({ words, step, available, widthAt }) * lineHeightAt(step) > maxHeight;

  /**
   * Stepping while *either* is unhappy, rather than settling width first and height
   * after. The two do not fail at the same rung, and a title that is narrow enough at
   * step 4 can still be too tall there; only this order lands on a step where both are
   * satisfied. It still stops at the floor, because display type shrunk into a caption is
   * not a better failure than a header a little taller than its share.
   */
  let step = top;
  while (step > minStep && (tooWide(step) || tooTall(step))) step -= 1;
  return step;
};

/**
 * The step a title may actually use in a column `columnWidth` px wide.
 *
 * `titleStep` counts characters, which is blind to the one case that actually clips: an
 * unbreakable word wider than its column. "Northbridge before dawn" is 23 characters, so
 * the ladder returns step 5 — 120px — and set in the 5/12 copy column of `splitLeft` the
 * first word alone is wider than the box. `AnimatedText` wraps its children in
 * `overflow: hidden` to clip the rise, and that same rule then cut the word off mid-glyph.
 * The frame stayed well inside its safe area throughout, which is why the render contract
 * suite never saw it.
 *
 * Measured rather than estimated. A proxy — average glyph width, a character budget per
 * step — is wrong in exactly the case that matters, because the strings that clip are the
 * ones whose letterforms are unusual. `measureText` reads the real advance width of the
 * real loaded font at the real size, synchronously and leaving no DOM of its own behind,
 * which is what keeps the component a pure function of (props, frame).
 */
export const useTitleStep = (
  text: string,
  columnWidth: number,
  ceiling?: number,
  maxHeight?: number,
): number => {
  const theme = useTheme();
  const density = useDensity();

  return useMemo(() => {
    const sizeAt = (step: number): number =>
      Math.round((theme.type.scale[step] as number) * density);

    const widthAt = (candidate: string, step: number): number =>
      measureText({
        text: candidate,
        fontFamily: theme.type.display,
        fontSize: sizeAt(step),
        fontWeight: theme.type.weight.bold,
        letterSpacing: `${theme.type.tracking.tight * sizeAt(step)}px`,
      }).width;

    return fitTitleStep({
      words: text.split(/\s+/).filter(Boolean),
      top: Math.min(ceiling ?? titleStep(text.length), theme.type.scale.length - 1),
      available: columnWidth * TITLE_MAX_WIDTH,
      widthAt,
      maxHeight,
      lineHeightAt: (step) => sizeAt(step) * TITLE_LINE_HEIGHT,
    });
  }, [text, columnWidth, ceiling, maxHeight, theme, density]);
};
