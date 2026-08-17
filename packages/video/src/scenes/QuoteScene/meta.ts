import type { SceneMeta } from '../../core/types';

/**
 * Selection metadata. This is what the agent reads to *choose* the scene, before it
 * ever reads the schema.
 *
 * `avoidWhen` entries redirect explicitly and must contain `→`; the catalog contract
 * enforces the arrow. One line of redirection is worth three paragraphs of description.
 *
 * On `occupiesRegions: ['left', 'center']` — measured, not hoped. `centered` is not
 * centred: it is a left-aligned column, vertically centred as a block, and `SceneTitle`
 * caps at 86% of it, so at the schema ceiling the ink never passes x = 71.9% under any
 * of the six motion profiles. `left` alone would free `right`, where the ink genuinely
 * goes; adding `center` keeps `right`, `top` and `bottom` correctly taken and frees
 * exactly `cornerTR` and `cornerBR` — a character in either corner is a rung-a `keep`,
 * and the scene is never shrunk for it. The margin is two points and undesigned, which
 * is why `tests/render/occupies-regions.test.ts` exists: it renders the ceiling under
 * every profile and fails if the ink ever crosses.
 *
 * On `supportedCompositions` — the halves are paid for. The composed form is drawn:
 * in a portrait box the column takes the box's full width and the quote sets a rung
 * below the length ladder (`layouts.ts` holds the numbers). It was not free. The first
 * claim failed its own gate — `example-quote-long` composed into a half under `pushIn`
 * outgrew the box and the camera spent the whole margin — which is what
 * `BarChartScene/meta.ts`'s header means by an unpaid claim, caught one suite earlier.
 * `safe-area.test.ts` renders every declared half now, and the stills were reviewed.
 */
export const quoteMeta: SceneMeta = {
  id: 'quote',
  name: 'QuoteScene',
  family: 'typography',
  summary: 'A single quotation set large, with who said it. The words are the frame.',
  useWhen: [
    "letting a person's own words carry the frame",
    'handing the narration over to a testimony, verdict or declaration',
    'slowing the film down for one sentence that deserves to stand alone',
  ],
  avoidWhen: [
    'comparing quantities between categories → bar_chart',
    'pairing a claim with a photograph → image_context',
    'making one number the story → stat_counter',
  ],
  supportsEvents: true,
  requiresAssets: false,
  occupiesRegions: ['left', 'center'],
  supportedCompositions: ['full', 'left', 'right'],
  minDurationFrames: 90,
  recommendedDurationFrames: 180,
};
