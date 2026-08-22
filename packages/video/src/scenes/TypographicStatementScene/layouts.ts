/**
 * One layout, on purpose.
 *
 * A second arrangement would be a different scene. The card's whole claim is that the
 * frame changes register at once; an alternative arrangement of a full-bleed ground is not
 * a variation on that, it is a second answer to a question that has one.
 */
import type { LayoutDef } from '../../core/types';

export const typographicStatementLayouts = {
  cut: {
    slots: ['eyebrow', 'statement', 'ordinal'],
    description:
      'The emphasis role taken to full bleed, with the eyebrow and the statement knocked ' +
      'out of it and centred, and the ordinal small in the bottom corner.',
  },
} as const satisfies Record<string, LayoutDef>;

/**
 * Layout-owned geometry. Agents never author these proportions, so none of it appears in
 * `schema.ts`.
 */
export const cutGeometry = {
  /**
   * Share of the frame box the statement column gets.
   *
   * Wider than `quote`'s 0.72 because there is nothing else on the frame to leave room for
   * — no mark, no attribution, no rule. What still bounds the measure is `TITLE_MAX_WIDTH`
   * inside it, and the fit underneath that.
   */
  columnRatio: 0.82,
  /**
   * The step the statement starts at, and the one number that makes this card a card.
   *
   * Passed to the fit as its `top`, which **replaces** the character ladder in
   * `titleFit.ts` rather than capping it: a chapter card is as loud as the scale goes, and
   * what takes it down is the measured fit, not a count of characters. See the regime
   * written out at the foot of `constraints.ts`.
   */
  statementStep: 6,
  /**
   * Share of the scene's box the statement may take before the fit steps it down.
   *
   * The card reserves the rest for its apparatus: the eyebrow above and the ordinal in the
   * corner. `MAX_STATEMENT_SHARE` — the ceiling the content-stress probe holds a statement
   * to — is one, the whole box, and a statement that actually took the whole box would set
   * its last line through the ordinal. This is stricter than the probe on purpose, which is
   * the only direction a scene may be.
   */
  statementShare: 0.72,
  /**
   * How far an unspoken word recedes toward the ground, as a mix.
   *
   * Measured, not chosen by eye. At 0.28 the recessive tone holds 3.15:1 against its ground
   * at the tightest of the six role × theme combinations (`positive` on `editorial-paper`),
   * which clears the 3:1 large-text floor — and every word on this card is large text, at
   * 48px in the worst case the schema admits. The knocked-out ink itself runs 4.59:1 to
   * 10.30:1 across the same six.
   *
   * The recession is deliberately mild. A word the voice has not reached yet still has to
   * be *readable*: the viewer reads ahead of the narrator, and a sweep that hid its own
   * sentence would be a word-at-a-time reveal, which is the treatment this design rejected.
   */
  unspokenMix: 0.28,
  /**
   * The mark under the word the voice is on, as shares of the type size.
   *
   * Shares rather than px, because the statement's step moves with the copy and a 4px rule
   * under 168px type is a hairline while the same rule under 48px type is a bar. The
   * proportion is `AccentRule`'s own — a 96 × 4 rule is 1/24 of its length — read here
   * against the type it underlines rather than against a fixed width.
   */
  markThickness: 1 / 24,
  markOffset: 1 / 12,
} as const;
