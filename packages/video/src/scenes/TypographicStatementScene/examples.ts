/**
 * Examples are normative. The agent imitates them far more faithfully than it follows a
 * description, so the set covers the shape of the problem and not just its happy path: the
 * canonical card, the same card driven, an edge case past the recommended band, and an
 * empty case that proves the scene survives with no statement at all.
 *
 * The driven example differs from the canonical one **in its events and in nothing else** —
 * same props, same layout, same profile, same beat span — so an agent comparing the two sees
 * one variable and not three. The span is on both for that reason and not because the
 * canonical card needs three beats; an instance with no events resolves no anchors.
 *
 * **None of these can carry a word anchor, and that is not an omission.** A scene example
 * has no take: `syntheticBeats` gives it `words: []`, and a word anchor resolved against
 * that throws by design (ADR-0012). So `advanceWord` is shown here in the form a plan
 * without a recorded take actually writes — one event per word, anchored to beat
 * boundaries. The seven-anchor word form is published to the agent through the structural
 * plan example in `catalog/structural-examples.ts`, which is a plan rather than a render
 * and can carry the anchors as illustration. No compensating scene example is invented to
 * make up for it; one was, elsewhere, and it was removed.
 */
import type { SceneExample } from '../../core/types';

/** The canonical copy, kept in one place so the driven example can differ only in events. */
const chapterTwo = {
  eyebrow: 'Chapter two',
  statement: 'Nobody is left to absorb the difference',
  ordinal: '02 / 05',
  emphasis: 'neutral',
} as const;

export const typographicStatementExamples: SceneExample[] = [
  {
    id: 'example-statement-canonical',
    title: 'Canonical chapter card',
    note: 'The shot this capability exists for: one sentence across a ground that fills the frame, so the film visibly changes register at the act break.',
    component: 'typographic_statement',
    layout: 'cut',
    motionProfile: 'editorialStatic',
    /**
     * Three beats, matching the driven example exactly, so that "differs only in its events"
     * is true of the pair rather than nearly true. An eventless instance resolves no
     * anchors, so the span costs this frame nothing and buys the comparison its one
     * variable.
     */
    spansBeats: ['b1', 'b2', 'b3'],
    props: { ...chapterTwo },
  },
  {
    id: 'example-statement-driven',
    title: 'Plan-driven hold and sweep — the voice walks through the sentence',
    note: 'The eyebrow carries the frame for a beat, then one advanceWord per word paced at beat boundaries, because a scene example has no recorded take. Same props and profile as the canonical example; only the events differ. With a take, every one of these becomes a word anchor.',
    component: 'typographic_statement',
    layout: 'cut',
    motionProfile: 'editorialStatic',
    spansBeats: ['b1', 'b2', 'b3'],
    events: [
      { at: 'b1.start+short', action: 'revealStatement' },
      { at: 'b1.start+long', action: 'advanceWord' },
      { at: 'b2.start', action: 'advanceWord' },
      { at: 'b2.start+short', action: 'advanceWord' },
      { at: 'b2.start+long', action: 'advanceWord' },
      { at: 'b3.start', action: 'advanceWord' },
      { at: 'b3.start+short', action: 'advanceWord' },
      { at: 'b3.start+long', action: 'advanceWord' },
    ],
    props: { ...chapterTwo },
  },
  {
    id: 'example-statement-long',
    title: 'Edge case — a statement past the recommended band',
    note: 'Edge case for statement density: copy past the band steps down the type scale until it fits the band the card reserves, and the ground carries a negative reading of the chapter it opens.',
    component: 'typographic_statement',
    layout: 'cut',
    motionProfile: 'impact',
    spansBeats: ['b1'],
    props: {
      eyebrow: 'Chapter three',
      statement: 'Every repair proposed since 2015 has assumed somebody else would absorb the gap',
      ordinal: '03 / 05',
      emphasis: 'negative',
    },
  },
  {
    id: 'example-statement-empty',
    title: 'Empty case — no statement',
    note: 'Empty copy remains renderable and falls back to a typographic pending state on the same ground.',
    component: 'typographic_statement',
    layout: 'cut',
    motionProfile: 'editorialStatic',
    spansBeats: ['b1'],
    props: {
      eyebrow: '',
      statement: '',
      ordinal: '',
      emphasis: 'neutral',
    },
  },
];
