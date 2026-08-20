/** Deterministic value formatting. No locale lookups: the render must be reproducible. */

const GROUP = /\B(?=(\d{3})+(?!\d))/g;

export const formatValue = (value: number, unit = ''): string => {
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  const [int = '0', frac] = Math.abs(rounded).toString().split('.');
  const grouped = int.replace(GROUP, ' ');
  const sign = rounded < 0 ? '-' : '';
  const body = frac ? `${grouped}.${frac}` : grouped;
  if (!unit) return `${sign}${body}`;
  return unit === '%' || unit === '°' ? `${sign}${body}${unit}` : `${sign}${body} ${unit}`;
};

/** Interpolate a counter toward its final value without ever overshooting the label. */
export const countTo = (value: number, progress: number): number =>
  value * Math.min(1, Math.max(0, progress));

/**
 * The longest prefix of `text` that fits `available` px, with an ellipsis where it was cut.
 *
 * This replaced a `truncate(text, max)` that counted characters. A character budget is a
 * proxy for a width, and it is wrong in exactly the case that matters: `truncate(label, 14)`
 * handed the same fourteen characters to a column 300px wide and to one 60px wide, so a
 * chart composed into half a frame drew category labels wider than the columns naming them
 * — and because a flex item's minimum size is its min-content width, the row then sized
 * itself to the labels and took the whole plot with it, 592px into the half the compiler
 * had reserved for something else. A ranking paid for the same mistake on the other axis:
 * a name wrapped to three lines makes the row three lines tall, and the pitch the chart
 * aggregates against stops being the pitch.
 *
 * Which characters fit is a fact about the glyphs, so it is measured rather than counted,
 * the same argument `useAxisGutter` makes for the axis indent. `widthOf` is injected
 * rather than imported so this stays a pure function of its inputs — the shape
 * `fitTitleStep` uses, and for the same reason: the decision can then be tested without a
 * browser, against a ruler that lies in a known way.
 *
 * An unmeasurable box is left alone rather than emptied, because a width of zero is a
 * frame mid-layout and not a column that cannot hold a name.
 */
export const truncateToWidth = (
  text: string,
  available: number,
  widthOf: (candidate: string) => number,
): string => {
  if (text === '' || available <= 0) return text;
  if (widthOf(text) <= available) return text;

  /**
   * The largest cut that still fits, found by halving rather than by walking, because a
   * linear walk would measure the real font once per character per label per frame.
   *
   * A longer prefix is never narrower than a shorter one except where the extra
   * characters are trailing spaces, which `trimEnd` removes — so the search can settle
   * one character early on a prefix that ends in a space, and can never settle on one
   * that does not fit. Erring short is the harmless direction here.
   */
  /**
   * A cut that never lands between the halves of a surrogate pair.
   *
   * `slice` counts UTF-16 code units and an astral character — an emoji in a category
   * name — is two of them, so a cut one unit in leaves a lone surrogate: one unit wide to
   * the ruler, and a replacement box on the frame. Stepping back drops the whole character
   * instead, which is the direction this search already errs in.
   */
  const cutAt = (chars: number): string => {
    const lead = text.charCodeAt(chars - 1);
    const splitsAPair = lead >= 0xd800 && lead <= 0xdbff;
    return text.slice(0, splitsAPair ? chars - 1 : chars).trimEnd();
  };

  const fits = (chars: number): boolean => widthOf(`${cutAt(chars)}…`) <= available;

  let low = 0;
  let high = text.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (fits(mid)) low = mid;
    else high = mid - 1;
  }

  /**
   * Not even one character and an ellipsis: a lone ellipsis names nothing, so draw none.
   * Tested against the cut and not against `low`, because a cut one code unit into an
   * astral character comes back empty rather than as half a glyph.
   */
  const cut = cutAt(low);
  return cut === '' ? '' : `${cut}…`;
};
