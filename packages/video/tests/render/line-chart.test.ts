import { describe, expect, it } from 'vitest';
import { compositionIdFor, controlIdFor } from '../../src/runtime/compositionIds';
import { hashStill, renderHarness } from './harness';
import { type Bitmap, decodePng } from './png';

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

describe('LineChartScene runtime', () => {
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
    expect(canonical).toBe(
      // Accepted 2026-08-22 after inspecting the 1920×1080 still: a strong two-level
      // editorial header, quiet zero-based ruler, six proportionally spaced month labels,
      // every observation marked, and one warm straight-segment trend inside the safe area.
      'f92d10de9e5379dcfbee8a3d218b035f',
    );
  });

  it('keeps irregular calendar spacing visible in the accepted comparison frame', async () => {
    const comparison = hashStill(await still('example-line-comparison', 180));
    expect(comparison).toBe(
      // Accepted 2026-08-22: Jan→Mar is visibly wider than Mar→Apr, while the two
      // straight series remain distinct on the 3.8%..4.6% extent ruler.
      'f3bd08a369ab871139bf018645bf54e6',
    );
  });

  it('keeps the durable annotation attached with its point value', async () => {
    const annotated = hashStill(await still('example-line-driven', 239));
    expect(annotated).toBe(
      // Accepted 2026-08-22 at the last frame: the connector terminates at Jun and the
      // card still reads “Journeys · Jun · 63 m” plus the complete annotation copy.
      '78836c259f6abfa9b9057ece70ecac48',
    );
  });

  it('keeps the focused value legible while non-target series recede', async () => {
    const focused = hashStill(await still('example-line-density-edge', 239));
    expect(focused).toBe(
      // Accepted 2026-08-22: North remains warm and carries “12/25 · 117 k”; Central
      // and Coastal retain their identities at visibly quieter emphasis.
      '67953d9a94f5f285fb00b9ec75f2cb7b',
    );
  });

  it('keeps mixed-sign series crossing the visible zero rule at the hard ceiling', async () => {
    const mixed = hashStill(
      await harness.still(
        controlIdFor('line-chart-ceiling'),
        { controlId: 'line-chart-ceiling', motionProfile: 'editorialStatic' },
        239,
      ),
    );
    expect(mixed).toBe(
      // Accepted 2026-08-22: the labelled zero rule bisects both the rising negative-to-
      // positive line and the alternating series; all three ceiling labels remain readable.
      '9a742d0db5c9096bc63579bfd975fad9',
    );
  });
});
