/**
 * Examples are normative. The agent imitates them far more faithfully than it follows a
 * description, so the set has to cover the shape of the problem and not just its happy
 * path: the canonical shot, an edge case that pushes the value and the emphasis, and an
 * empty case that proves the scene survives with no label at all.
 *
 * The driven example holds the number back a beat so the label alone carries the frame —
 * the one behaviour `revealStat` exists for. It carries the *same props* as the canonical
 * example and differs only in its events, so an agent comparing the two sees one variable
 * and not three. `revealStat` is the only verb, so two examples suffice to exercise
 * everything `state.ts` knows.
 */
import type { SceneExample } from '../../core/types';

export const statCounterExamples: SceneExample[] = [
  {
    id: 'example-stat-canonical',
    title: 'Canonical statistic',
    note: 'The shot this capability exists for: one figure set large, with what it counts beneath.',
    component: 'stat_counter',
    layout: 'centered',
    motionProfile: 'editorialStatic',
    spansBeats: ['b1'],
    props: {
      value: 47,
      unit: '%',
      label: 'Share of income spent on rent',
      sublabel: 'up from 33% a decade ago',
      emphasis: 'neutral',
    },
  },
  {
    id: 'example-stat-negative',
    title: 'Edge case — negative swing',
    note: 'Edge case for emphasis: a falling figure reads in the negative colour, and a signed value still fits the column.',
    component: 'stat_counter',
    layout: 'centered',
    motionProfile: 'subtleDrift',
    spansBeats: ['b1'],
    props: {
      value: -14,
      unit: '%',
      label: 'Change in housing starts, year on year',
      sublabel: 'the sharpest fall since records began',
      emphasis: 'negative',
    },
  },
  {
    id: 'example-stat-driven',
    title: 'Plan-driven reveal — the number lands a beat after the label',
    note: 'The plan holds the number back, so the label stands alone on the frame while the narration reaches the figure. Same props and profile as the canonical example; only the events differ.',
    component: 'stat_counter',
    layout: 'centered',
    motionProfile: 'editorialStatic',
    spansBeats: ['b1', 'b2'],
    events: [{ at: 'b2.start', action: 'revealStat' }],
    props: {
      value: 47,
      unit: '%',
      label: 'Share of income spent on rent',
      sublabel: 'up from 33% a decade ago',
      emphasis: 'neutral',
    },
  },
  {
    id: 'example-stat-empty',
    title: 'Empty case — no label',
    note: 'Empty copy remains renderable and falls back to a typographic pending state.',
    component: 'stat_counter',
    layout: 'centered',
    motionProfile: 'editorialStatic',
    spansBeats: ['b1'],
    props: {
      value: 0,
      unit: '',
      label: '',
      sublabel: '',
      emphasis: 'neutral',
    },
  },
];
