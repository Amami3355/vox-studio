/**
 * `timeline`, drawn.
 *
 * **An accepted key frame is a decision, not a number.** A hash is a fingerprint of the
 * whole frame: it moves when anything moves and says nothing about *what*, so each one
 * below carries a sentence about the picture a person looked at, and a moved hash is a
 * still to open rather than a number to paste — `scripts/still.mts` into `.scratch/stills/`.
 *
 * The tests that are *not* hashes are the ones that name a property: that the chronology is
 * genuinely held back before its reveal, that the reveal runs earlier dates first, and that
 * a focus recedes what it is not pointing at. A hash pins the frame those produced; neither
 * half is the claim on its own.
 */
import { describe, expect, it } from 'vitest';
import { parseUtcDate } from '../../src/core/time-axis';
import { compositionIdFor } from '../../src/runtime/compositionIds';
import { hashStill, renderHarness } from './harness';
import { type Bitmap, decodePng } from './png';

const harness = renderHarness();

const still = (exampleId: string, frame: number, motionProfile: string | null = null) =>
  harness.still(
    compositionIdFor('timeline', exampleId),
    { capabilityId: 'timeline', exampleId, layout: null, motionProfile },
    frame,
  );

const rgbAt = (bitmap: Bitmap, x: number, y: number): [number, number, number] => {
  const at = (y * bitmap.width + x) * bitmap.channels;
  return [bitmap.pixels[at] ?? 0, bitmap.pixels[at + 1] ?? 0, bitmap.pixels[at + 2] ?? 0];
};

const differs = (a: [number, number, number], b: [number, number, number], by = 6): boolean =>
  a.some((channel, index) => Math.abs(channel - (b[index] as number)) > by);

/**
 * The axis, found rather than assumed: it is the one full-width rule in the lower half of
 * the frame, so it is the row with the most ink in it. Deriving it here rather than
 * restating `axisShare` keeps this a reading of the picture instead of a second copy of
 * the layout's arithmetic — which would agree with itself and with nothing else.
 */
const busiestRow = (bitmap: Bitmap): number => {
  const ground = rgbAt(bitmap, 4, 4);
  let bestRow = 0;
  let mostInk = 0;
  for (let y = Math.floor(bitmap.height * 0.4); y < Math.floor(bitmap.height * 0.85); y += 1) {
    let ink = 0;
    for (let x = 0; x < bitmap.width; x += 4) {
      if (differs(rgbAt(bitmap, x, y), ground)) ink += 1;
    }
    if (ink > mostInk) {
      mostInk = ink;
      bestRow = y;
    }
  }
  return bestRow;
};

/**
 * Where the event marks sit, in canvas px.
 *
 * Read a few pixels **below** the rule rather than on it. A mark is a disc centred on the
 * axis, so it is the only ink that reaches under a two-pixel stroke — and on the stroke
 * itself a period band's antialiased bottom edge bleeds into the same row, which welds
 * three marks and the stretch between them into one run. Below the rule the row is bare
 * ground with the discs standing in it.
 */
const MARK_PROBE_OFFSET = 4;

const markCentres = (bitmap: Bitmap, axisY: number): number[] => {
  const ground = rgbAt(bitmap, 4, 4);
  const row = axisY + MARK_PROBE_OFFSET;
  const centres: number[] = [];
  let runStart = -1;

  for (let x = 0; x <= bitmap.width; x += 1) {
    const isMark = x < bitmap.width && differs(rgbAt(bitmap, x, row), ground);
    if (isMark && runStart < 0) runStart = x;
    if (!isMark && runStart >= 0) {
      // A stray antialiased pixel is not a mark; a disc is several across.
      if (x - runStart > 3) centres.push((runStart + x - 1) / 2);
      runStart = -1;
    }
  }
  return centres;
};

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

describe('TimelineScene runtime', () => {
  it('holds every event back before a driven reveal', async () => {
    const [heldBytes, revealedBytes] = await Promise.all([
      still('example-timeline-driven', 20, 'editorialStatic'),
      still('example-timeline-driven', 200, 'editorialStatic'),
    ]);
    const held = decodePng(heldBytes);
    const revealed = decodePng(revealedBytes);

    /** The band the event labels stand in, above the axis and below the header. */
    const labels = { x: 120, y: 420, width: 1680, height: 200 };
    expect(changedPixels(held, revealed, labels)).toBeGreaterThan(0);
  });

  /**
   * The reveal runs in date order, which is authored order, so the earlier half of the
   * axis is populated before the later half. Asked as a comparison between two frames of
   * the same shot rather than as a hash, because "earlier first" is the property and a
   * fingerprint cannot state it.
   */
  it('reveals earlier dates before later ones', async () => {
    const [heldBytes, enteringBytes] = await Promise.all([
      still('example-timeline-driven', 92, 'editorialStatic'),
      still('example-timeline-driven', 104, 'editorialStatic'),
    ]);
    const held = decodePng(heldBytes);
    const entering = decodePng(enteringBytes);
    const left = changedPixels(held, entering, { x: 120, y: 420, width: 840, height: 200 });
    const right = changedPixels(held, entering, { x: 960, y: 420, width: 840, height: 200 });

    expect(left).toBeGreaterThan(0);
    expect(left).toBeGreaterThan(right);
  });

  it('renders the same settled frame identically twice', async () => {
    const [first, second] = await Promise.all([
      still('example-timeline-canonical', 180),
      still('example-timeline-canonical', 180),
    ]);
    expect(hashStill(first)).toBe(hashStill(second));
  });

  it('keeps the visually accepted canonical key frame stable', async () => {
    expect(hashStill(await still('example-timeline-canonical', 180))).toBe(
      // Accepted 2026-08-22 after inspecting the 1920×1080 still: a two-level editorial
      // header over one hairline axis; four dated events proportionally spaced, with the
      // crowded November label lifted onto a second lane; "CAP IN FORCE · 13 MONTHS" in its
      // own strip between the axis and the labels, drawn across exactly the stretch it
      // names; three year marks under the axis. Everything inside the safe area, and every
      // run of type at `inkMuted` or darker.
      'dd9350cab1312bc88ccf2d459435fc18',
    );
  });

  /**
   * The claim the `spine` layout exists to make, asked of the pixels.
   *
   * `timeline-layout.test.ts` proves the arithmetic places an event in exact proportion to
   * elapsed time. That is half the claim: an axis can be perfectly proportional and be
   * drawn through a component that spaces its marks evenly anyway. So the marks are found
   * in the rendered frame and their spacing compared against the calendar — which is the
   * only reading that cannot disagree with what a viewer sees.
   */
  it('spaces the marks on the axis in proportion to elapsed time', async () => {
    const frame = decodePng(await still('example-timeline-canonical', 180));
    const axisY = busiestRow(frame);
    const marks = markCentres(frame, axisY);

    expect(marks).toHaveLength(4);

    const days = ['2019-06-18', '2020-02-23', '2020-11-23', '2021-04-15'].map(
      (date) => (parseUtcDate(date) as number) / 86_400_000,
    );
    const drawn = marks as [number, number, number, number];
    const expectedRatio =
      ((days[2] as number) - (days[1] as number)) / ((days[1] as number) - (days[0] as number));
    const drawnRatio = (drawn[2] - drawn[1]) / (drawn[1] - drawn[0]);

    /** One pixel of anti-aliasing on each of four centres, over gaps of several hundred. */
    expect(drawnRatio).toBeCloseTo(expectedRatio, 1);
  });

  it('keeps the durable annotation attached to the moment it explains', async () => {
    expect(hashStill(await still('example-timeline-driven', 269))).toBe(
      // Accepted 2026-08-23 at the last frame: the connector drops from the Karlsruhe mark,
      // turns, and runs into the callout's own rule, so the note is attached to the moment
      // rather than floating under the axis. The card is titled with that event's label and
      // carries the whole annotation on two lines, clear of the frame's bottom edge.
      '48b264e80fa190a012c755ef3e2e3314',
    );
  });

  it('keeps the two-lane density edge readable', async () => {
    expect(hashStill(await still('example-timeline-density-edge', 180))).toBe(
      // Accepted 2026-08-23: six events, exactly the recommended edge. The crowded March
      // dates use separate lanes while the first and last remain labelled. The fifteen-month
      // investigation band spans exactly the stretch it names.
      '50e4556bcf480e09566041ecdd97e27f',
    );
  });

  it('keeps the empty chronology a designed frame rather than a bare axis', async () => {
    expect(hashStill(await still('example-timeline-empty', 120))).toBe(
      // Accepted 2026-08-22: the title holds under its accent rule, and a hairline with
      // "NO DATED EVENTS AVAILABLE" set quietly beneath it stands in for the chronology.
      // No axis is drawn — an axis with nothing on it reads as a broken render rather than
      // as an empty one. The same shape `line_chart` gives its own empty case.
      '2dc1ef4d03ce2efaf7f126aaeb73e17c',
    );
  });
});
