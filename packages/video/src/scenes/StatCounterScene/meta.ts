import type { SceneMeta } from '../../core/types';

/**
 * Selection metadata. This is what the agent reads to *choose* the scene, before it
 * ever reads the schema.
 *
 * `avoidWhen` entries redirect explicitly and must contain `→`; the catalog contract
 * enforces the arrow. One line of redirection is worth three paragraphs of description.
 *
 * On `occupiesRegions: ['left', 'center']` — measured, not hoped. `centered` is not
 * centred: it is a left-aligned column, vertically centred as a block. `left` alone
 * would free `right`, where the ink genuinely goes; adding `center` keeps `right`,
 * `top` and `bottom` correctly taken and frees exactly `cornerTR` and `cornerBR` — a
 * character in either corner is a rung-a `keep`, and the scene is never shrunk for it.
 *
 * What keeps those two corners clear is **vertical extent alone, by 1.7 points**. At the
 * schema ceiling (a signed seven-digit value, a 12-character unit, an 80-character
 * label) the value is wide display type and the ink runs to x = 81.8% — well inside the
 * corners' column — so nothing horizontal protects them. What does is that the block
 * draws no ink at all outside y 32.0%..68.3%: 2.0 points clear of the top corner row,
 * 1.7 points clear of the bottom, roughly 18px at 1080. The stack's height and its
 * vertical centring are therefore the fragile numbers here, not the column's width, and
 * anything that adds a line or a gap spends the margin. That is why
 * `tests/render/occupies-regions.test.ts` exists: it renders the ceiling under every
 * profile and fails if the ink ever crosses.
 *
 * On `supportedCompositions` — the halves are paid for. The composed form is drawn:
 * in a portrait box the column takes the box's full width and the label sets a rung
 * below the length ladder, while the value keeps `valueStep` — a figure does not wrap,
 * and the width fit already answers the narrower column (`layouts.ts` holds the
 * numbers). The claim's sibling failed its own gate before the form was drawn
 * (`quote`'s long example under `pushIn` outgrew the half and the camera spent the
 * whole margin); `safe-area.test.ts` renders every declared half now, and the stills
 * were reviewed.
 */
export const statCounterMeta: SceneMeta = {
  id: 'stat_counter',
  name: 'StatCounterScene',
  family: 'data',
  summary: 'A single number set large, with what it counts. The figure is the frame.',
  useWhen: [
    'making one number the story',
    'letting a single figure land on its own',
    'stating a statistic the narration has just said aloud',
  ],
  avoidWhen: [
    'comparing quantities between categories → bar_chart',
    'pairing a claim with a photograph → image_context',
    "letting a person's own words carry the frame → quote",
  ],
  supportsEvents: true,
  requiresAssets: false,
  occupiesRegions: ['left', 'center'],
  supportedCompositions: ['full', 'left', 'right'],
  minDurationFrames: 60,
  recommendedDurationFrames: 150,
};
