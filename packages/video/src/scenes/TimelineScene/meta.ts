import type { SceneMeta } from '../../core/types';

/**
 * Selection metadata — what the agent reads to *choose* a chronology, before it reads
 * the schema.
 *
 * `family: 'context'` and not `'data'`. `SceneFamily` is a closed set and none of its
 * members is "documentary", so the question was which existing member is right rather
 * than whether to widen the type. A chronology situates, which is what `image_context`
 * does with a photograph; `data` would file this beside the three charts while its own
 * `avoidWhen` exists precisely to say it is not one of them — a timeline carries no
 * numeric measure.
 *
 * The first two `avoidWhen` entries are the redirections this capability was added to
 * satisfy, pointed back the way they came: `bar_chart` sends "a sequence of dated events"
 * here and `line_chart` sends "dated events without a numeric measure" here, and both of
 * those had been leading to nothing. The return trip has to be as sharp, or an agent that
 * arrives with a measure in hand draws a trend as a list of dates.
 *
 * `supportedCompositions` and `occupiesRegions` are both `['full']`, and stay there until
 * a frame has been drawn for something else. `barChartMeta` is explicit about what a
 * composition entry costs — its own list read `['bottom', 'left']` from the scaffold
 * commit until a render put a narrator in the corner it had freed — and the note is worth
 * repeating here because this capability has an obvious candidate: `ledger` is a vertical
 * register and degrades by dropping rows, so it could plausibly survive a half frame.
 * `spine` cannot. A proportional axis in half a width is no longer an axis.
 */
export const timelineMeta: SceneMeta = {
  id: 'timeline',
  name: 'TimelineScene',
  family: 'context',
  summary: 'A sequence of dated events in the order they happened, carrying no numeric measure.',
  useWhen: [
    'showing a chronology of dated events',
    'showing how long a named period lasted and what fell inside it',
    'showing that two moments are separated by a silence',
    'situating a decision, a ruling or an announcement in time',
  ],
  avoidWhen: [
    'showing a numeric measure that moves over time → line_chart',
    'comparing discrete named categories → bar_chart',
    'showing a single figure, dated or not → stat_counter',
    'showing ordered steps that carry no dates → diagram',
  ],
  supportsEvents: true,
  requiresAssets: false,
  occupiesRegions: ['full'],
  supportedCompositions: ['full'],
  /** The axis, its years and a staggered run of events are all settled by frame 110. */
  minDurationFrames: 110,
  /** Nine seconds holds the chronology, one focus and one annotation left up to be read. */
  recommendedDurationFrames: 270,
};
