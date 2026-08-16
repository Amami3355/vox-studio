/**
 * Examples are normative. The agent imitates them far more faithfully than it follows a
 * description, so the set has to cover the shape of the problem and not just its happy
 * path: the canonical shot, an edge case that pushes copy past the recommended band, and
 * an empty case that proves the scene survives with no quote at all.
 *
 * The driven example holds the quote back a beat so the eyebrow alone carries the frame —
 * the one behaviour `revealQuote` exists for. It carries the *same props* as the
 * canonical example and differs only in its events, so an agent comparing the two sees
 * one variable and not three. `revealQuote` is the only verb, so two examples suffice to
 * exercise everything `state.ts` knows.
 */
import type { SceneExample } from '../../core/types';

export const quoteExamples: SceneExample[] = [
  {
    id: 'example-quote-canonical',
    title: 'Canonical quotation',
    note: 'The shot this capability exists for: a speaker’s words set large, alone, with the attribution beneath.',
    component: 'quote',
    layout: 'centered',
    motionProfile: 'editorialStatic',
    spansBeats: ['b1'],
    props: {
      eyebrow: 'The testimony',
      quote: 'Rents doubled in two years while wages barely moved',
      attribution: 'Maria Alvarez',
      role: 'Housing economist',
    },
  },
  {
    id: 'example-quote-long',
    title: 'Edge case — long quotation',
    note: 'Edge case for quote density: copy past the recommended band drops the type scale and the column still holds it.',
    component: 'quote',
    layout: 'centered',
    motionProfile: 'subtleDrift',
    spansBeats: ['b1'],
    props: {
      eyebrow: 'The testimony',
      quote:
        'For young households the hardest thing is not that rents are high — it is that they have kept climbing, year after year, far faster than anything else in a budget, and that no one is left to absorb the difference.',
      attribution: 'Maria Alvarez',
      role: 'Housing economist',
    },
  },
  {
    id: 'example-quote-driven',
    title: 'Plan-driven reveal — the words land a beat after the eyebrow',
    note: 'The plan holds the quote back, so the eyebrow stands alone on the frame while the narration hands over. Same props as the canonical example; only the events differ.',
    component: 'quote',
    layout: 'centered',
    motionProfile: 'subtleDrift',
    spansBeats: ['b1', 'b2'],
    events: [{ at: 'b2.start', action: 'revealQuote' }],
    props: {
      eyebrow: 'The testimony',
      quote: 'Rents doubled in two years while wages barely moved',
      attribution: 'Maria Alvarez',
      role: 'Housing economist',
    },
  },
  {
    id: 'example-quote-empty',
    title: 'Empty case — no quote',
    note: 'Empty copy remains renderable and falls back to a typographic pending state.',
    component: 'quote',
    layout: 'centered',
    motionProfile: 'editorialStatic',
    spansBeats: ['b1'],
    props: {
      eyebrow: '',
      quote: '',
      attribution: '',
      role: '',
    },
  },
];
