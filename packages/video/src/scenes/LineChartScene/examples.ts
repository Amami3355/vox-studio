import type { SceneExample } from '../../core/types';
import type { LineChartProps } from './schema';

const canonicalProps: LineChartProps = {
  title: 'Monthly rail journeys keep climbing',
  unit: 'm',
  baseline: 'zero',
  points: [
    { date: '2025-01-01', label: 'Jan' },
    { date: '2025-02-01', label: 'Feb' },
    { date: '2025-03-01', label: 'Mar' },
    { date: '2025-04-01', label: 'Apr' },
    { date: '2025-05-01', label: 'May' },
    { date: '2025-06-01', label: 'Jun' },
  ],
  series: [{ label: 'Journeys', values: [42, 45, 44, 51, 56, 63] }],
};

const edgePoints = Array.from({ length: 36 }, (_, index) => ({
  date: `${2023 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`,
  label: `${String((index % 12) + 1).padStart(2, '0')}/${String(23 + Math.floor(index / 12))}`,
}));

export const lineChartExamples: SceneExample[] = [
  {
    id: 'example-line-canonical',
    title: 'Canonical monthly trend',
    note: 'One series, a zero baseline and proportional calendar spacing. The trend reveals automatically.',
    component: 'line_chart',
    layout: 'standard',
    motionProfile: 'subtleDrift',
    spansBeats: ['b1', 'b2'],
    pace: 'measured',
    props: canonicalProps,
  },
  {
    id: 'example-line-comparison',
    title: 'Two-series comparison',
    note: 'Two related rates share an extent axis so their narrow but meaningful movement remains visible.',
    component: 'line_chart',
    layout: 'standard',
    motionProfile: 'editorialStatic',
    spansBeats: ['b1', 'b2'],
    props: {
      title: 'Mortgage rates diverged after spring',
      unit: '%',
      baseline: 'extent',
      points: [
        { date: '2025-01-01', label: 'Jan' },
        { date: '2025-03-01', label: 'Mar' },
        { date: '2025-04-01', label: 'Apr' },
        { date: '2025-07-01', label: 'Jul' },
        { date: '2025-10-01', label: 'Oct' },
      ],
      series: [
        { label: 'Fixed', values: [4.1, 4.0, 4.15, 4.45, 4.6] },
        { label: 'Variable', values: [4.0, 4.05, 4.2, 4.1, 3.95] },
      ],
    },
  },
  {
    id: 'example-line-driven',
    title: 'Plan-driven reveal and annotation',
    note: 'Same evidence as the canonical example; events first hold the line back, then attach one durable explanation.',
    component: 'line_chart',
    layout: 'standard',
    motionProfile: 'pushIn',
    spansBeats: ['b1', 'b2', 'b3'],
    pace: 'slow',
    props: canonicalProps,
    events: [
      { at: 'b2.start', action: 'revealTrend' },
      {
        at: 'b3.start',
        action: 'annotatePoint',
        payload: { series: 'Journeys', label: 'Jun', text: 'Summer demand arrived early' },
      },
    ],
  },
  {
    id: 'example-line-density-edge',
    title: 'Edge case — 36 points and three series',
    note: 'The hard density boundary: every observation remains in the lines while intermediate labels and ordinary markers thin.',
    component: 'line_chart',
    layout: 'standard',
    motionProfile: 'impact',
    spansBeats: ['b1', 'b2', 'b3'],
    props: {
      title: 'Three years of monthly demand across the full service network',
      unit: 'k',
      baseline: 'zero',
      points: edgePoints,
      series: [
        {
          label: 'North',
          values: edgePoints.map((_, index) => 48 + index * 1.7 + (index % 4) * 3),
        },
        {
          label: 'Central',
          values: edgePoints.map((_, index) => 39 + index * 1.25 + (index % 5) * 2),
        },
        {
          label: 'Coastal',
          values: edgePoints.map((_, index) => 31 + index * 1.45 + (index % 3) * 4),
        },
      ],
      focus: { series: 'North', label: '12/25' },
    },
  },
  {
    id: 'example-line-empty',
    title: 'Empty case — no temporal observations',
    note: 'The canonical empty shape preserves the title and shows a designed explanation instead of a broken plot.',
    component: 'line_chart',
    layout: 'standard',
    motionProfile: 'editorialStatic',
    spansBeats: ['b1'],
    props: {
      title: 'No comparable trend was published',
      points: [],
      series: [],
      unit: '',
      baseline: 'zero',
    },
  },
];
