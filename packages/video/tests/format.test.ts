/**
 * Fitting a category label to the column that has to carry it.
 *
 * Written after a real frame was wrong: `bar_chart` at its schema ceiling composed into
 * half a frame drew its plot 592px into the half the compiler had reserved for a
 * persistent element. `truncate(label, 14)` was the cause — fourteen characters is a
 * proxy for a width, and in a 60px column fourteen characters are not fourteen
 * characters, they are an overflow that sizes the flex row and drags the whole chart out
 * with it. Nothing caught it: the content-stress probe cancels the render on the line
 * ceiling first, so the three region assertions that would have seen it were skipped.
 *
 * A ruler rather than a browser, for the reason `title-fit.test.ts` gives for its own:
 * `measureText`'s accuracy is Remotion's problem and is exercised by the rendered frame.
 * What is worth pinning here is the decision — that it cuts to the width it was given,
 * never past it, and never to a lone ellipsis.
 */
import { describe, expect, it } from 'vitest';
import { truncateToWidth } from '../src/core/format';

/** Every glyph the same width, ellipsis included. Boring on purpose. */
const ruler =
  (perChar: number) =>
  (text: string): number =>
    text.length * perChar;

describe('truncateToWidth', () => {
  it('leaves a label that already fits untouched', () => {
    expect(truncateToWidth('NORTHERN', 400, ruler(10))).toBe('NORTHERN');
  });

  it('cuts to the widest prefix that fits, and marks the cut', () => {
    // 10px a glyph in 60px: six glyphs, of which the ellipsis is one.
    const cut = truncateToWidth('NORTHERN CITIES', 60, ruler(10));

    expect(cut).toBe('NORTH…');
    expect(ruler(10)(cut)).toBeLessThanOrEqual(60);
  });

  it('never returns something wider than the column it was given', () => {
    const widthOf = ruler(7);
    for (const available of [14, 21, 35, 70, 140]) {
      expect(
        widthOf(truncateToWidth('rents in the northern cities', available, widthOf)),
      ).toBeLessThanOrEqual(available);
    }
  });

  it('draws nothing rather than a lone ellipsis', () => {
    // One glyph of room is room for the ellipsis and nothing else, and an ellipsis on its
    // own names no category — it is a mark saying a name was here.
    expect(truncateToWidth('NORTHERN', 10, ruler(10))).toBe('');
  });

  it('does not leave a trailing space sitting against the ellipsis', () => {
    // Five glyphs of room. The cut lands inside the space, and the space goes with it
    // rather than being drawn as a gap the reader has to interpret.
    expect(truncateToWidth('THE NORTHERN', 50, ruler(10))).toBe('THE…');
  });

  it('never cuts an astral character in half', () => {
    // The ruler counts UTF-16 code units, so the emoji is two of them and the widest
    // prefix that fits is exactly the six units ending halfway through it. Cutting there
    // would draw `NORTH` and a replacement box; the whole character goes instead.
    expect(truncateToWidth('NORTH\u{1F600}ERN', 70, ruler(10))).toBe('NORTH…');
  });

  it('draws nothing rather than half a glyph and an ellipsis', () => {
    // Room for one unit before the ellipsis, and the first character is two units wide.
    // The lone-ellipsis rule reaches this only once the cut is what is tested.
    expect(truncateToWidth('\u{1F600}NORTH', 25, ruler(10))).toBe('');
  });

  it('leaves an unmeasurable box alone rather than emptying it', () => {
    // A width of zero is a frame mid-layout, not a column that cannot hold a name.
    expect(truncateToWidth('NORTHERN', 0, ruler(10))).toBe('NORTHERN');
    expect(truncateToWidth('', 100, ruler(10))).toBe('');
  });
});
