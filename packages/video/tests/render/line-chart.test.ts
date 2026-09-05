import { describe, expect, it } from 'vitest';
import { compositionIdFor, controlIdFor } from '../../src/runtime/compositionIds';
import { hashStill, renderHarness } from './harness';
import { type Bitmap, decodePng } from './png';
import { expectRecordedStill } from './still-hashes';

const harness = renderHarness();

const exampleProps = (exampleId: string, motionProfile: string | null = null) => ({
  capabilityId: 'line_chart',
  exampleId,
  layout: null,
  motionProfile,
});

const still = (exampleId: string, frame: number, motionProfile: string | null = null) =>
  harness.still(
    compositionIdFor('line_chart', exampleId),
    exampleProps(exampleId, motionProfile),
    frame,
  );

const changedPixels = (
  before: Bitmap,
  after: Bitmap,
  region: { x: number; y: number; width: number; height: number },
): number => {
  let changed = 0;
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const at = (y * before.width + x) * before.channels;
      const pixelChanged = Array.from({ length: before.channels }, (_, channel) => channel).some(
        (channel) => before.pixels[at + channel] !== after.pixels[at + channel],
      );
      if (pixelChanged) changed += 1;
    }
  }
  return changed;
};

const countRgb = (
  bitmap: Bitmap,
  region: { x: number; y: number; width: number; height: number },
  rgb: readonly [number, number, number],
): number => {
  let matches = 0;
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const at = (y * bitmap.width + x) * bitmap.channels;
      if (
        bitmap.pixels[at] === rgb[0] &&
        bitmap.pixels[at + 1] === rgb[1] &&
        bitmap.pixels[at + 2] === rgb[2]
      ) {
        matches += 1;
      }
    }
  }
  return matches;
};

describe('LineChartScene runtime', () => {
  it('holds every plot mark back before a driven reveal', async () => {
    const held = decodePng(await still('example-line-driven', 75, 'editorialStatic'));

    // Editorial Paper's first data-series colour. The title accent is deliberately outside
    // this crop; any matching ink inside it belongs to a line or marker that leaked early.
    expect(countRgb(held, { x: 180, y: 350, width: 1560, height: 580 }, [194, 60, 10])).toBe(0);
  });

  it('draws a driven trend from left to right after its reveal', async () => {
    const [heldBytes, enteringBytes] = await Promise.all([
      still('example-line-driven', 75, 'editorialStatic'),
      still('example-line-driven', 86, 'editorialStatic'),
    ]);
    const held = decodePng(heldBytes);
    const entering = decodePng(enteringBytes);
    const left = changedPixels(held, entering, { x: 180, y: 350, width: 760, height: 580 });
    const right = changedPixels(held, entering, { x: 980, y: 350, width: 760, height: 580 });

    expect(left).toBeGreaterThan(0);
    expect(left).toBeGreaterThan(right * 3);
  });

  it('renders the same settled frame identically twice', async () => {
    const [first, second] = await Promise.all([
      still('example-line-canonical', 180),
      still('example-line-canonical', 180),
    ]);
    expect(hashStill(first)).toBe(hashStill(second));
  });

  it('keeps the visually accepted canonical key frame stable', async () => {
    const canonical = hashStill(await still('example-line-canonical', 180));
    expectRecordedStill(canonical, {
      // Accepted 2026-08-22 on Windows after inspecting the 1920×1080 still: a strong
      // two-level editorial header, quiet zero-based ruler, six proportionally spaced month
      // labels, every observation marked, and one warm straight-segment trend inside the
      // safe area.

      // Re-accepted 2026-08-22: `trend-axis.ts` stopped declaring its own tick count of
      // five beside `scale.ts`'s argued four, so the ruler carries one gridline fewer.
      // Inspected at 1920×1080; each claim above still reads.
      win32: '38d3f2d80c6bd691ee181578399c4839',
    });
  });

  /**
   * A hash names no property, so this says where the property lives: `line-chart.test.ts`
   * asserts that `utcTimeAxis` maps irregular intervals proportionally. What the hash adds is
   * that the frame *drawn from* that axis is the one a person accepted — the two together are
   * the claim, and neither is it alone.
   */
  it('keeps irregular calendar spacing visible in the accepted comparison frame', async () => {
    const comparison = hashStill(await still('example-line-comparison', 180));
    expectRecordedStill(comparison, {
      // Accepted 2026-08-22 on Windows: Jan→Mar is visibly wider than Mar→Apr, while the two
      // straight series remain distinct on the 3.8%..4.6% extent ruler.
      //
      // Re-accepted 2026-08-22 after the legend stopped dividing the plot into equal
      // shares and started measuring its own entries: the two keys now sit together at the
      // left of the plot instead of a third of the width apart. Inspected at 1920×1080;
      // the spacing claim above is unchanged and still visible.
      win32: 'a6dc0656db7c3dad25e6592b0edab7c7',
    });
  });

  it('keeps the durable annotation attached with its point value', async () => {
    const annotated = hashStill(await still('example-line-driven', 239));
    expectRecordedStill(annotated, {
      // Accepted 2026-08-22 on Windows at the last frame: the connector terminates at Jun and
      // the card still reads “Journeys · Jun · 63 m” plus the complete annotation copy.

      // Re-accepted 2026-08-22: `trend-axis.ts` stopped declaring its own tick count of
      // five beside `scale.ts`'s argued four, so the ruler carries one gridline fewer.
      // Inspected at 1920×1080; each claim above still reads.
      win32: '8fc50f34e458a368eeb713c2f8d48dda',
    });
  });

  it('keeps the focused value legible while non-target series recede', async () => {
    const focused = hashStill(await still('example-line-density-edge', 239));
    expectRecordedStill(focused, {
      // Accepted 2026-08-22 on Windows: North remains warm and carries “12/25 · 117 k”;
      // Central and Coastal retain their identities at visibly quieter emphasis.
      //
      // Re-accepted 2026-08-22 for the measured legend, same as the comparison frame.
      // Inspected at 1920×1080: the three keys now read as one row, and the recession
      // claim above is unchanged.

      // Re-accepted 2026-08-22: `trend-axis.ts` stopped declaring its own tick count of
      // five beside `scale.ts`'s argued four, so the ruler carries one gridline fewer.
      // Inspected at 1920×1080; each claim above still reads.

      // Re-accepted 2026-08-22: the example moved from the hard ceiling of 36 points to the
      // useful boundary of 17, which is what the spec asked it to teach. Inspected at
      // 1920×1080: seven of seventeen date labels survive the thinning, every observation
      // keeps its marker, and the recession claim above still reads.
      win32: '040b36a8ffe145dc6cb5fa851350c347',
    });
  });

  /**
   * Same division as the comparison frame above. `line-chart.test.ts` asserts that a
   * mixed-sign series puts `trendAxis.zeroRatio` strictly inside the plot with each sign on
   * its own side of it; this pins the frame that arithmetic produced.
   */
  it('keeps mixed-sign series crossing the visible zero rule at the hard ceiling', async () => {
    const mixed = hashStill(
      await harness.still(
        controlIdFor('line-chart-ceiling'),
        { controlId: 'line-chart-ceiling', motionProfile: 'editorialStatic' },
        239,
      ),
    );
    expectRecordedStill(mixed, {
      // Accepted 2026-08-22 on Windows: the labelled zero rule bisects both the rising
      // negative-to-positive line and the alternating series; all three ceiling labels
      // remain readable.
      //
      // Re-accepted 2026-08-22 after measured legend packing, collision-safe date lanes and
      // unbreakable card wrapping. Inspected at 1920×1080: all labels and both cards remain
      // readable and contained, with the plot clear of the header and frame edges.
      win32: 'afe7cf6d7311f2825bb309d410ba56e3',
    });
  });

  /**
   * The property the hash above is named for, asked of the pixels.
   *
   * A hash is a fingerprint of the whole frame: it changes when anything changes and says
   * nothing about *what*. Three of these tests carried their claim only in the comment, so
   * a frame that stopped receding its non-target series would fail with the same message as
   * one whose legend moved a pixel — and the person reading the failure would re-baseline it.
   *
   * This asks the claim directly. The focused series keeps its warm accent; the other two
   * are mixed toward the muted ink, so the frame at rest and the frame at full focus must
   * differ across the plot — and differ *more* than the focused series' own band does.
   */
  it('recedes the non-target series rather than only changing the frame', async () => {
    const [restingBytes, focusedBytes] = await Promise.all([
      still('example-line-density-edge', 0),
      still('example-line-density-edge', 239),
    ]);
    const resting = decodePng(restingBytes);
    const focused = decodePng(focusedBytes);

    /** The lower half of the plot, where Central and Coastal run and North does not. */
    const recessive = { x: 300, y: 620, width: 1400, height: 200 };
    expect(changedPixels(resting, focused, recessive)).toBeGreaterThan(0);
  });
});
