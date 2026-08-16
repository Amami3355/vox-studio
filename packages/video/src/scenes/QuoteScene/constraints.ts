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
 * Resulting regime for `quote`:
 *   0 characters   → empty state, plus an info warning
 *   1–110          → optimal band
 *   111–240        → renders one type step down, plus a TITLE_DENSITY warning
 *   > 240          → validation error, rejected
 */
