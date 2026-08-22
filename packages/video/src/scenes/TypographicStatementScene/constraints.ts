/**
 * SOFT constraints. Published to the manifest, not just used in validation.
 *
 * Each entry names the degradation it buys, so the agent can decide whether the trade is
 * worth it. The statement band is tight on purpose: a chapter card that needs a long
 * sentence is a `quote`, and `meta.ts` redirects there.
 */
import type { SoftConstraints } from '../../core/types';

export const typographicStatementConstraints: SoftConstraints = {
  statement: {
    recommendedMin: 1,
    recommendedMax: 72,
    onEmpty: 'Typographic empty state; the frame shows a "statement pending" label.',
    onExceed: 'The statement steps down the type scale until it fits the band the card reserves.',
    /** This capability's heading, so density is the failure it suffers from. */
    onExceedCode: 'TITLE_DENSITY',
  },
  eyebrow: {
    recommendedMax: 24,
    onExceed: 'Shorten the eyebrow; it is a label, not a second statement.',
  },
  ordinal: {
    recommendedMax: 8,
    onExceed: 'Shorten the ordinal; it is a page number, not a title.',
  },
};

/**
 * Resulting regime for `statement`. One ladder runs here, not two, and that is the
 * difference from `quote`.
 *
 * `quote` runs the character ladder in `titleFit.ts` — ≤ 40 → 5, ≤ 70 → 4, > 70 → 3 — and
 * then fits underneath it. This card declines the ladder and starts every statement at the
 * top of the scale (`cutGeometry.statementStep`), because a chapter card is as loud as it
 * can be by definition; what takes it down is the measured fit against the band the layout
 * reserves. So length degrades the type here too, and it does it by measurement rather than
 * by a character count that is blind to the letterforms.
 *
 *   0 characters   → empty state, plus an info warning
 *   1–72           → recommended; the fit decides the step, from 168px downward
 *   73–140         → still fitted, now over several lines and further down the scale, plus
 *                    a TITLE_DENSITY warning
 *   > 140          → validation error, rejected
 */
