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
 * Below this step a headline has stopped being a headline.
 *
 * The same judgement as `barChartGeometry.minCategories`: if a column cannot hold the
 * longest word at 48px, the honest outcome is a word that touches its margins, not display
 * type shrunk into a caption. Clipping is what this exists to prevent; disappearing is not
 * a better failure.
 */
export const TITLE_MIN_STEP = 2;

/**
 * The largest step at or below `top` at which every word fits inside `available`.
 *
 * Only the widest word constrains the answer, because a string wraps and a word does not.
 * It is found once at `top` and then re-measured as the step drops: which word is widest
 * cannot change with size, since the whole string — tracking included — scales together.
 *
 * `widthAt` is injected rather than imported so this stays a pure function of its inputs.
 */
export const fitTitleStep = ({
  words,
  top,
  available,
  widthAt,
  minStep = TITLE_MIN_STEP,
}: {
  words: string[];
  top: number;
  available: number;
  widthAt: (word: string, step: number) => number;
  minStep?: number;
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

  let step = top;
  while (step > minStep && widthAt(widest, step) > available) step -= 1;
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
export const useTitleStep = (text: string, columnWidth: number, ceiling?: number): number => {
  const theme = useTheme();
  const density = useDensity();

  return useMemo(() => {
    const widthAt = (word: string, step: number): number => {
      const size = Math.round((theme.type.scale[step] as number) * density);
      return measureText({
        text: word,
        fontFamily: theme.type.display,
        fontSize: size,
        fontWeight: theme.type.weight.bold,
        letterSpacing: `${theme.type.tracking.tight * size}px`,
      }).width;
    };

    return fitTitleStep({
      words: text.split(/\s+/).filter(Boolean),
      top: Math.min(ceiling ?? titleStep(text.length), theme.type.scale.length - 1),
      available: columnWidth * TITLE_MAX_WIDTH,
      widthAt,
    });
  }, [text, columnWidth, ceiling, theme, density]);
};
