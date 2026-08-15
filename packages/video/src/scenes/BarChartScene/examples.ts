/**
 * Examples are normative.
 *
 * A model imitates an example far more faithfully than it follows a description, which
 * makes this the cheapest lever on agent reliability in the whole system — and also
 * means anything wrong here propagates. In particular: events carry semantic anchors,
 * never frames. If the agent ever sees `"frame": 312` in an example, it will write
 * frames, and the whole symbolic-time contract collapses.
 *
 * At least three per capability, including one edge case and one empty case.
 */
import type { SceneExample } from '../../core/types';

export const barChartExamples: SceneExample[] = [
  {
    id: 'example-rent-burden',
    title: 'Ranking with a late highlight',
    note: 'The canonical shape: baseline, cascade, then one value pulled forward.',
    component: 'bar_chart',
    layout: 'standard',
    motionProfile: 'energetic',
    spansBeats: ['b1', 'b2', 'b3'],
    pace: 'measured',
    props: {
      title: 'Share of income spent on rent',
      unit: '%',
      emphasis: 'negative',
      gridlines: true,
      data: [
        { label: 'Berlin', value: 27 },
        { label: 'Paris', value: 33 },
        { label: 'Amsterdam', value: 38 },
        { label: 'Dublin', value: 42 },
        { label: 'London', value: 47 },
      ],
    },
    events: [
      { at: 'b1.start', action: 'showBaseline' },
      { at: 'b2.start', action: 'revealAll' },
      { at: 'b3.start', action: 'highlightBar', payload: { label: 'London' } },
    ],
  },

  {
    id: 'example-annotated-comparison',
    title: 'Annotated comparison',
    note: 'Uses the withCallout layout: the chart holds the full row until the annotate event lands, then yields a column to it. Also the axis-down case — the chart gives up a third of the row, so five printed figures cost less width than a ruler plus its number column.',
    component: 'bar_chart',
    layout: 'withCallout',
    motionProfile: 'pushIn',
    spansBeats: ['b1', 'b2', 'b3', 'b4'],
    pace: 'slow',
    props: {
      title: 'Median deposit needed for a first home',
      unit: 'k',
      emphasis: 'neutral',
      gridlines: false,
      highlight: '2025',
      data: [
        { label: '2005', value: 18 },
        { label: '2010', value: 24 },
        { label: '2015', value: 39 },
        { label: '2020', value: 52 },
        { label: '2025', value: 71 },
      ],
    },
    events: [
      { at: 'b1.start', action: 'showBaseline' },
      { at: 'b2.start', action: 'revealAll' },
      { at: 'b3.start', action: 'highlightBar', payload: { label: '2025' } },
      {
        at: 'b4.start',
        action: 'annotate',
        payload: { label: '2025', text: 'Four times the 2005 figure' },
      },
    ],
  },

  {
    id: 'example-long-ranking',
    title: 'Edge case — 20 entries, long title',
    note: "Soft limits both breached: the weakest values collapse into 'Others' and the title drops a type step.",
    component: 'bar_chart',
    layout: 'horizontal',
    motionProfile: 'impact',
    spansBeats: ['b1'],
    pace: 'quick',
    // Deliberately a count, not a rate: aggregation sums, and summing percentages
    // produces a meaningless bucket. See docs/proposals/architecture-evolutions.md.
    props: {
      title: 'New homes completed last year across every metropolitan area surveyed',
      unit: 'k',
      emphasis: 'neutral',
      data: [
        { label: 'Lisbon', value: 19 },
        { label: 'Athens', value: 17 },
        { label: 'Madrid', value: 16 },
        { label: 'Milan', value: 15 },
        { label: 'Warsaw', value: 14 },
        { label: 'Prague', value: 13 },
        { label: 'Vienna', value: 12 },
        { label: 'Lyon', value: 11 },
        { label: 'Rotterdam', value: 9 },
        { label: 'Hamburg', value: 8 },
        { label: 'Gothenburg', value: 8 },
        { label: 'Antwerp', value: 7 },
        { label: 'Bologna', value: 7 },
        { label: 'Malmo', value: 6 },
        { label: 'Bilbao', value: 6 },
        { label: 'Aarhus', value: 5 },
        { label: 'Leipzig', value: 5 },
        { label: 'Porto', value: 4 },
        { label: 'Tampere', value: 3 },
        { label: 'Graz', value: 2 },
      ],
    },
    events: [{ at: 'b1.start', action: 'revealAll' }],
  },

  {
    id: 'example-empty',
    title: 'Empty case — no data',
    note: 'A missing series is a legitimate state. Renders a typographic frame, not a black screen.',
    component: 'bar_chart',
    layout: 'standard',
    motionProfile: 'editorialStatic',
    spansBeats: ['b1'],
    props: {
      title: 'No comparable figures were published',
      unit: '',
      emphasis: 'neutral',
      data: [],
    },
    events: [],
  },

  {
    id: 'example-negative-swing',
    title: 'Edge case — negative values',
    note: 'A negative value recomputes the axis around a zero line instead of drawing off-frame.',
    component: 'bar_chart',
    layout: 'standard',
    motionProfile: 'subtleDrift',
    spansBeats: ['b1', 'b2'],
    props: {
      title: 'Change in housing starts',
      unit: '%',
      emphasis: 'positive',
      highlight: 'Spain',
      data: [
        { label: 'Spain', value: 12 },
        { label: 'France', value: 4 },
        { label: 'Germany', value: -6 },
        { label: 'Sweden', value: -14 },
      ],
    },
    events: [
      { at: 'b1.start', action: 'revealAll' },
      { at: 'b2.start+long', action: 'highlightBar', payload: { label: 'Spain' } },
    ],
  },
];
