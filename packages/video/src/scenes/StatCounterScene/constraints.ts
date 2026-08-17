/**
 * SOFT constraints. Published to the manifest, not just used in validation.
 *
 * The hard ceilings in `schema.ts` are generous on purpose — rejecting a plan over copy
 * length is the wrong regime for a quality problem. These are the numbers that actually
 * shape what the agent writes, and each one names the degradation it buys so the agent
 * can decide whether the trade is worth it.
 *
 * `value` has no band: it is a number, not copy, and its size is a fact about the world
 * rather than a writing choice. The fit owns its width.
 */
import type { SoftConstraints } from '../../core/types';

export const statCounterConstraints: SoftConstraints = {
  label: {
    recommendedMin: 1,
    recommendedMax: 60,
    onEmpty: 'Typographic empty state; the frame shows a "stat pending" label.',
    onExceed: 'The label drops one step of the type scale.',
    /** This capability's heading, so density is the failure it suffers from. */
    onExceedCode: 'TITLE_DENSITY',
  },
  sublabel: {
    recommendedMax: 60,
    onExceed: 'Shorten the sublabel; it is support, not a second claim.',
  },
  unit: {
    recommendedMax: 6,
    onExceed: 'Shorten the unit; it is a suffix, not a word.',
  },
};

/**
 * Resulting regime for `label`. Two ladders run at once and they do not share a rung, so
 * they are listed apart rather than merged into one misleading column.
 *
 * The *warning* ladder is the band above — `recommendedMax: 60`.
 * The *type* ladder is `titleStep` in `titleFit.ts` — ≤ 40 → 5, ≤ 70 → 4, > 70 → 3 — and
 * it drops at 41 and at 71, neither of which is 60. A label can therefore be a step down
 * while still inside the recommended band, and can cross the band without dropping.
 *
 *   0 characters   → empty state, plus an info warning
 *   1–40           → recommended, set at step 5
 *   41–60          → recommended, already one step down at 4
 *   61–70          → still step 4, plus a TITLE_DENSITY warning
 *   71–80          → step 3, plus a TITLE_DENSITY warning
 *   > 80           → validation error, rejected
 *
 * All of it is a ceiling, never a guarantee: `fitTitleStep` measures the widest word and
 * may take the label lower still in a narrow column.
 */
