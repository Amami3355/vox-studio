import type { SceneMeta } from '../../core/types';

/**
 * Selection metadata. This is what the agent reads to *choose* the scene, before it
 * ever reads the schema.
 *
 * The capability the catalogue was missing. Five capabilities existed and three of them
 * were charts: the manifest could compare, trend and count, and it had no way to say what
 * a chapter *is*. Every compiler check decides whether a shot is legible and honest and
 * not one of them decides whether the sequence has a structure.
 *
 * On `occupiesRegions: ['full']` — a ground that fills the frame leaves no quadrant free,
 * and there is nothing measured about that: the emphasis role is painted edge to edge, so
 * every corner is ink. `bar_chart`'s header says what an unpaid claim costs; this one is
 * paid by construction rather than by a sweep.
 *
 * On `supportedCompositions: ['full']` — deliberate, and different in kind from
 * `line_chart`'s. `line_chart` is full-only because no composed form has been designed yet,
 * which is a first-increment non-goal. A chapter card is full-only because **an act break
 * must not share the frame**: a narrator standing in the corner of the cut is a narrator
 * who did not stop, and the cut is the one thing this scene draws.
 *
 * The consequence belongs on the record rather than in a footnote. `conflict.ts` searches
 * `supportedCompositions` for a slot that clears a contending element, so this is the
 * second capability that can never reach ADR-0003 rung b — a persistent element crossing it
 * always relocates or hides. For `line_chart` that is a cost. Here it is the intent.
 */
export const typographicStatementMeta: SceneMeta = {
  id: 'typographic_statement',
  name: 'TypographicStatementScene',
  family: 'typography',
  summary:
    'One sentence set across a coloured ground that fills the frame. The chapter card that ' +
    'divides a film into movements.',
  useWhen: [
    'opening an act, chapter or movement, and saying what it is about',
    'marking the turn in an argument, where the film changes register',
    'stating a thesis in the film’s own voice, between two runs of evidence',
  ],
  avoidWhen: [
    'setting a person’s own words → quote',
    'making one number the story → stat_counter',
    'pairing a claim with a photograph → image_context',
  ],
  supportsEvents: true,
  requiresAssets: false,
  occupiesRegions: ['full'],
  supportedCompositions: ['full'],
  /**
   * Two seconds and four. Shorter than `quote`'s 90/180 because a card is seven words and
   * not a paragraph, and a chapter card held past its sentence stops reading as a cut and
   * starts reading as a stall. Provisional until the stills say otherwise.
   */
  minDurationFrames: 60,
  recommendedDurationFrames: 120,
};
