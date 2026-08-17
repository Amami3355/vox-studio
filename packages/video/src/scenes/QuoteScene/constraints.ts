/**
 * SOFT constraints. Published to the manifest, not just used in validation.
 *
 * The hard ceilings in `schema.ts` are generous on purpose — rejecting a plan over copy
 * length is the wrong regime for a quality problem. These are the numbers that actually
 * shape what the agent writes, and each one names the degradation it buys so the agent
 * can decide whether the trade is worth it.
 */
import type { SoftConstraints } from '../../core/types';

export const quoteConstraints: SoftConstraints = {
  quote: {
    recommendedMin: 1,
    recommendedMax: 110,
    onEmpty: 'Typographic empty state; the frame shows a "quote pending" label.',
    onExceed: 'The quote drops one step of the type scale.',
    /** This capability's heading, so density is the failure it suffers from. */
    onExceedCode: 'TITLE_DENSITY',
  },
  attribution: {
    recommendedMax: 40,
    onExceed: 'Shorten the attribution; it is a signature, not a bio.',
  },
  role: {
    recommendedMax: 40,
    onExceed: 'Shorten the role line; it is context, not a second quote.',
  },
  eyebrow: {
    recommendedMax: 24,
    onExceed: 'Shorten the eyebrow; it is a label, not copy.',
  },
};

/**
 * Resulting regime for `quote`. Two ladders run at once and they do not share a rung, so
 * they are listed apart rather than merged into one misleading column.
 *
 * The *warning* ladder is the band above — `recommendedMax: 110`.
 * The *type* ladder is `titleStep` in `titleFit.ts` — ≤ 40 → 5, ≤ 70 → 4, > 70 → 3 — and
 * it bottoms out at 71. A quote at the top of the recommended band is therefore already at
 * the ladder's floor, and crossing the band buys no further drop at all.
 *
 *   0 characters   → empty state, plus an info warning
 *   1–40           → recommended, set at step 5
 *   41–70          → recommended, one step down at 4
 *   71–110         → recommended, at the ladder's floor step 3
 *   111–240        → still step 3 — the ladder has nothing left to give, so the quote sets
 *                    more lines instead — plus a TITLE_DENSITY warning
 *   > 240          → validation error, rejected
 *
 * All of it is a ceiling, never a guarantee: `fitTitleStep` measures the widest word and
 * may take the quote lower still in a narrow column.
 */
