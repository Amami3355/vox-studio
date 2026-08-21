/**
 * What a chosen composition costs the scene's data.
 *
 * The compiler decides which composition a scene yields into (`conflict.ts`), and until
 * now that was the end of its interest: it published the safe area and moved on. But a
 * composition is not only a rectangle — for a capability whose output depends on a count,
 * it is also a decision about how much of the plan's data survives to the screen, taken by
 * the compiler, on the agent's behalf, in silence.
 *
 * Every other degradation in this system announces itself: `ASSET_PLACEHOLDER`,
 * `SOFT_LIMIT_EXCEEDED`, `TITLE_DENSITY`, `PERSISTENT_ELEMENT_HIDDEN`. This one changed
 * the numbers on screen and said nothing to anybody, which is how a chart titled "Share of
 * income spent on rent" came to draw a city that does not exist.
 *
 * **Declared, never computed.** Nothing here knows what a column pitch is. It reads the
 * table the capability publishes in `meta.ts` and compares it to a length — ADR-0003
 * decision 4 intact, and `tests/composed-capacity.test.ts` is what keeps that table
 * honest.
 */
import { type Series, aggregateBeyond } from '../core/aggregate';
import type { Slot } from '../core/types';
import { findCapability } from '../scenes/registry';

export type CapacityOutcome = {
  /** The composition the scene is drawing in. */
  composition: Slot;
  /** How many entries it holds there, from the capability's published table. */
  capacity: number;
  /** How many it would hold on the full canvas. */
  onFullCanvas: number;
  /** The entries that reach the screen. */
  survivors: Series[];
  /** The entries that do not. Empty when the data fits. */
  collapsed: Series[];
};

/** A series prop, if the value really is one. A malformed one is already an error. */
const seriesOf = (props: Record<string, unknown>, field: string): Series[] | null => {
  const value = props[field];
  if (!Array.isArray(value)) return null;
  const series = value.filter(
    (d): d is Series =>
      typeof d === 'object' &&
      d !== null &&
      typeof (d as Series).label === 'string' &&
      typeof (d as Series).value === 'number',
  );
  return series.length === value.length ? series : null;
};

/**
 * Null whenever the question does not apply: a capability that publishes no capacity
 * table, a scene whose props carry no readable series, or a composition the table does not
 * cover. Silence here is the absence of a claim, never a claim that nothing happened.
 */
export const capacityOutcome = (
  scene: { capabilityId: string; layout: string; props: Record<string, unknown> },
  composition: Slot | null,
): CapacityOutcome | null => {
  const meta = findCapability(scene.capabilityId)?.meta;
  if (!meta?.capacityByComposition || !meta.seriesField) return null;

  const chosen = composition ?? 'full';
  const capacity = meta.capacityByComposition[chosen]?.[scene.layout];
  const onFullCanvas = meta.capacityByComposition.full?.[scene.layout];
  if (capacity === undefined || onFullCanvas === undefined) return null;

  const series = seriesOf(scene.props, meta.seriesField);
  if (series === null) return null;

  /**
   * Read with the default mode on purpose. `valueKind` decides what happens to the
   * collapsed entries — a bucket or nothing — and not *which* entries collapse, so the
   * survivor split is the same either way and the compiler does not have to know a
   * capability-specific prop to compute it.
   */
  const { series: survivors, collapsed } = aggregateBeyond(series, capacity);

  return { composition: chosen, capacity, onFullCanvas, survivors, collapsed };
};

/** Did yielding into this composition cost the scene data it would have kept at full size? */
export const reducesData = (outcome: CapacityOutcome | null): boolean =>
  outcome !== null && outcome.collapsed.length > 0 && outcome.capacity < outcome.onFullCanvas;
