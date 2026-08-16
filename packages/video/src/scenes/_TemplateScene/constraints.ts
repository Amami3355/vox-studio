/**
 * TEMPLATE — copy this folder, do not register this scene.
 *
 * SOFT constraints. Published to the manifest, not just used in validation, and they are
 * the numbers that actually shape what the agent writes.
 *
 * Every entry names the degradation it buys, so the agent can decide whether the trade is
 * worth it. "Keep it short" teaches nothing; "the headline drops one step of the type
 * scale" teaches a choice.
 *
 * At least one entry is required — the catalog contract fails a capability that publishes
 * a hard schema with no soft band beside it.
 */
import type { SoftConstraints } from '../../core/types';

/**
 * TODO one entry per field of `schema.ts` that has a band worth publishing, and the numbers
 * are yours to measure. Every `onExceed` names the degradation it buys; "keep it short"
 * teaches nothing.
 */
export const templateSceneConstraints: SoftConstraints = {
  statement: {
    recommendedMin: 1,
    recommendedMax: 60,
    onEmpty: 'The frame falls back to the eyebrow alone.',
    onExceed: 'The statement drops one step of the type scale.',
    /** This capability's heading, so density is the failure it suffers from. */
    onExceedCode: 'TITLE_DENSITY',
  },
  eyebrow: {
    recommendedMax: 24,
    onExceed: 'Shorten the eyebrow; it is a label, not a second line of copy.',
  },
};

/**
 * Resulting regime for `statement`:
 *   0 characters   → empty state, the eyebrow carries the frame, plus an info warning
 *   1–60           → optimal band
 *   61–160         → renders one type step down, plus a TITLE_DENSITY warning
 *   > 160          → validation error, rejected
 */
