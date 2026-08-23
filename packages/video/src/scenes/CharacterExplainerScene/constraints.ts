/**
 * SOFT constraints. Published to the manifest, not just used in validation, and they are
 * the numbers that actually shape what the agent writes.
 *
 * Every entry names the degradation it buys, so the agent can decide whether the trade is
 * worth it. "Keep it short" teaches nothing; "the headline drops one step of the type
 * scale" teaches a choice.
 */
import type { SoftConstraints } from '../../core/types';

export const characterExplainerConstraints: SoftConstraints = {
  label: {
    recommendedMax: 24,
    onExceed: 'Shorten the label; it names the character, it is not a second headline.',
  },
  headline: {
    recommendedMin: 1,
    recommendedMax: 48,
    onEmpty:
      'The frame leans on the character, the label and the explanation; the copy column shows a designed pending note instead.',
    onExceed: 'The headline steps down the type scale until the copy column fits it.',
    /** This capability's heading, so density is the failure it suffers from. */
    onExceedCode: 'TITLE_DENSITY',
  },
  explanation: {
    recommendedMax: 160,
    onExceed: 'The explanation wraps onto more lines and recedes further behind the headline.',
  },
};

/**
 * Resulting regime for `headline`:
 *   0 characters   → empty-copy state beside the character, plus an info warning
 *   1–48           → optimal band, around one display line of the copy column
 *   49–120         → steps down or wraps within the measured geometry, plus a
 *                    TITLE_DENSITY warning
 *   > 120          → validation error, rejected
 */
