/**
 * `capacityByComposition` is a published number, and this is what it costs.
 *
 * `constraints.ts` told every agent for the whole life of the composed form that values
 * ranked below the top 8 are collapsed. A composed box had been collapsing below the top 3
 * that entire time. Nothing was lying; nothing was checking. The table in `meta.ts` is the
 * same kind of claim, so it gets the discipline `meta.ts` already demands of
 * `supportedCompositions` — every entry recomputed from the arithmetic the scene actually
 * runs, and a failure the moment the two drift.
 *
 * **What this proves and what it does not.** It proves the published number is the number
 * `layouts.ts` computes, for every composition, every layout and every motion profile —
 * which is the whole of the compiler's claim, since the compiler only ever repeats what is
 * declared here. It does not prove the resulting frame is worth watching; that is a render
 * and a person, and `meta.ts` says so in terms.
 */
import { describe, expect, it } from 'vitest';
import { slotRect } from '../src/core/slots';
import type { Slot } from '../src/core/types';
import { motionProfiles } from '../src/design/motion';
import { themes } from '../src/design/theme';
import { cameraBounds, cameraInset } from '../src/primitives/CameraRig';
import { frameBoxFor } from '../src/primitives/SlotFrame';
import { barChartConstraints } from '../src/scenes/BarChartScene/constraints';
import {
  type BarChartLayoutId,
  barChartCapacity,
  barChartLayoutIds,
} from '../src/scenes/BarChartScene/layouts';
import { barChartMeta } from '../src/scenes/BarChartScene/meta';

const recommendedMax = barChartConstraints.data?.recommendedMax ?? 8;

/** Every capacity a real render could produce for one composition and one layout. */
const computed = (slot: Slot, variant: BarChartLayoutId): number[] =>
  Object.values(themes).flatMap((theme) =>
    Object.values(motionProfiles).map((profile) =>
      barChartCapacity({
        box: frameBoxFor(slotRect(slot), {
          margin: theme.grid.margin,
          camera: cameraInset(cameraBounds(profile.camera)),
        }),
        variant,
        theme,
        recommendedMax,
      }),
    ),
  );

describe('bar_chart publishes what its composed box actually holds', () => {
  it('declares a capacity for every composition it supports', () => {
    const declared = Object.keys(barChartMeta.capacityByComposition ?? {});
    expect(new Set(declared)).toEqual(new Set(barChartMeta.supportedCompositions));
  });

  it('declares a capacity for every layout, because the two axes disagree', () => {
    for (const slot of barChartMeta.supportedCompositions) {
      const entry = barChartMeta.capacityByComposition?.[slot];
      expect(Object.keys(entry ?? {}).sort()).toEqual([...barChartLayoutIds].sort());
    }
  });

  for (const slot of barChartMeta.supportedCompositions) {
    for (const variant of barChartLayoutIds) {
      /**
       * The floor and not an average: the camera allowance belongs to the motion profile,
       * so the same half frame holds 4 columns under `impact` and 3 under `pushIn`. Only
       * the smallest value is true whatever the plan chooses.
       */
      it(`publishes the guaranteed capacity of ${slot}/${variant}`, () => {
        const declared = barChartMeta.capacityByComposition?.[slot]?.[variant];
        expect(declared).toBe(Math.min(...computed(slot, variant)));
      });

      it(`never promises more than ${slot}/${variant} can draw`, () => {
        const declared = barChartMeta.capacityByComposition?.[slot]?.[variant] ?? 0;
        for (const actual of computed(slot, variant))
          expect(actual).toBeGreaterThanOrEqual(declared);
      });
    }
  }

  /**
   * The rule `constraints.ts` used to state unconditionally. It is still true of the full
   * canvas, which is why the sentence survived so long without being noticed as wrong.
   */
  it('still holds the whole soft limit on the full canvas', () => {
    for (const variant of barChartLayoutIds) {
      expect(barChartMeta.capacityByComposition?.full?.[variant]).toBe(recommendedMax);
    }
  });

  /**
   * The repair the table exists to make sayable: a chart that must share its section with
   * a persistent element loses more than half its categories as columns and none of them
   * as rows. Before this table there was no way to publish that, and no way for an agent
   * to find it without reading `layouts.ts`.
   */
  it('shows that a half frame costs a ranking nothing and a column chart most of itself', () => {
    const half = barChartMeta.capacityByComposition?.left;
    expect(half?.horizontal).toBe(recommendedMax);
    expect(half?.standard).toBeLessThan(recommendedMax / 2);
  });
});
