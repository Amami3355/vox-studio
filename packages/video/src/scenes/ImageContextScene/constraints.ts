/**
 * SOFT constraints. Published to the manifest, not just used in validation.
 *
 * The hard ceilings in `schema.ts` are generous on purpose — rejecting a plan over copy
 * length is the wrong regime for a quality problem. These are the numbers that actually
 * shape what the agent writes, and each one names the degradation it buys so the agent
 * can decide whether the trade is worth it.
 */
import type { SoftConstraints } from '../../core/types';

export const imageContextConstraints: SoftConstraints = {
  headline: {
    recommendedMin: 1,
    recommendedMax: 40,
    onEmpty:
      'The image and optional caption carry the context. An unresolved image uses its subject as a fallback when all copy is empty.',
    onExceed:
      'Longer copy covers more of the image. The headline wraps and reduces its type scale when needed to fit.',
    /** A headline is this capability's heading; density is the failure it suffers from. */
    onExceedCode: 'TITLE_DENSITY',
  },
  caption: {
    recommendedMax: 90,
    onExceed: 'Shorten the caption to preserve an image-led composition.',
  },
};

/**
 * Resulting regime for `headline`:
 *   0 characters   → image/caption or unresolved subject fallback, plus an info warning
 *   1–40           → optimal band
 *   41–120         → wraps and shrinks to fit, plus a TITLE_DENSITY warning
 *   > 120          → validation error, rejected
 */
