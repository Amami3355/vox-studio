/**
 * The narration-versus-data check, on its own terms.
 *
 * `plans.test.ts` holds it to the plan that failed on 2026-08-21. This file holds it to the
 * cases that plan does not contain — the pointing gesture, the multi-word label, the word
 * that merely starts with a label's letters — because the precision of this check is its
 * entire justification. One that fired on "Berliner" or on a value nobody mentions would
 * be ignored inside a week, and an ignored report is worse than none.
 */
import { describe, expect, it } from 'vitest';
import { NO_SAFE_AREA, type CompilerWarning } from '../src/core/types';
import type { CompiledScene } from '../src/compile/document';
import { reportCollapsedMentions } from '../src/compile/coherence';

const scene = (events: CompiledScene['events'] = []): CompiledScene => ({
  id: 'chart',
  capabilityId: 'bar_chart',
  props: {},
  layout: 'standard',
  motionProfile: 'subtleDrift',
  assets: {},
  from: 0,
  to: 100,
  events,
  safeArea: NO_SAFE_AREA,
});

const run = ({
  collapsed,
  beats = [],
  events = [],
}: {
  collapsed: string[];
  beats?: { id: string; text: string }[];
  events?: CompiledScene['events'];
}): CompilerWarning[] => {
  const warnings: CompilerWarning[] = [];
  reportCollapsedMentions({
    scene: scene(events),
    collapsed: collapsed.map((label) => ({ label, value: 1 })),
    beats,
    sectionId: 'sec',
    warnings,
  });
  return warnings;
};

describe('a collapsed value that is still being spoken about', () => {
  it('is reported when a beat the scene spans names it', () => {
    const warnings = run({
      collapsed: ['Berlin'],
      beats: [{ id: 'b3', text: 'Berlin sits twenty points lower.' }],
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe('NARRATION_NAMES_COLLAPSED_VALUE');
    expect(warnings[0]?.message).toContain('beat "b3"');
  });

  it('is reported when an event carries it in free text', () => {
    const warnings = run({
      collapsed: ['Berlin'],
      events: [{ frame: 10, action: 'annotate', payload: { text: 'Twenty points above Berlin' } }],
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.field).toBe('props.data');
    expect(warnings[0]?.message).toContain('events[0].payload.text');
  });

  /**
   * A payload field that *is* the label is a different defect with a different repair: the
   * event resolves and draws nothing, the way a `highlightBar` on an absent label does.
   */
  it('is reported separately when an event points at it by name', () => {
    const warnings = run({
      collapsed: ['Berlin'],
      events: [{ frame: 10, action: 'highlightBar', payload: { label: 'Berlin' } }],
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.field).toBe('events[0].payload.label');
    expect(warnings[0]?.message).toContain('draw nothing');
  });

  it('reports both when an event points at it and the narration names it too', () => {
    const warnings = run({
      collapsed: ['Berlin'],
      beats: [{ id: 'b3', text: 'Berlin sits lower.' }],
      events: [{ frame: 10, action: 'highlightBar', payload: { label: 'Berlin' } }],
    });

    expect(warnings.map((warning) => warning.field)).toEqual([
      'events[0].payload.label',
      'props.data',
    ]);
  });

  it('matches a label made of several words', () => {
    expect(
      run({
        collapsed: ['New York'],
        beats: [{ id: 'b1', text: 'New York is the outlier here.' }],
      }),
    ).toHaveLength(1);
  });

  it('folds case, because a sentence may open on the name', () => {
    expect(
      run({ collapsed: ['Berlin'], beats: [{ id: 'b1', text: 'berlin sits lower.' }] }),
    ).toHaveLength(1);
  });
});

describe('a collapsed value nobody is talking about', () => {
  it('says nothing when no beat and no event names it', () => {
    expect(
      run({ collapsed: ['Paris'], beats: [{ id: 'b1', text: 'Rents rose everywhere.' }] }),
    ).toEqual([]);
  });

  /**
   * Words, not substrings, through the repository's one tokeniser. Reporting "Berliner" as
   * a mention of "Berlin" is the class of false positive that ends with an agent skipping
   * the report — and `core/words.ts` exists precisely so that three different consumers
   * cannot disagree about where a word ends.
   */
  it('does not mistake a longer word that merely starts the same way', () => {
    expect(
      run({ collapsed: ['Berlin'], beats: [{ id: 'b1', text: 'A Berliner would disagree.' }] }),
    ).toEqual([]);
  });

  it('reads punctuation as the tokeniser does, so a trailing comma still counts', () => {
    expect(
      run({ collapsed: ['Berlin'], beats: [{ id: 'b1', text: 'In Berlin, rents rose.' }] }),
    ).toHaveLength(1);
  });

  it('says nothing at all when nothing was collapsed', () => {
    expect(run({ collapsed: [], beats: [{ id: 'b1', text: 'Berlin sits lower.' }] })).toEqual([]);
  });
});
