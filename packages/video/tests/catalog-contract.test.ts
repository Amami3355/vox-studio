/**
 * The catalog entry checklist, enforced.
 *
 * Every capability added to the registry must clear these before it is usable by an
 * agent. This is the checklist from the frozen architecture doc, turned into something
 * that fails a build instead of something someone remembers to read.
 */
import { describe, expect, it } from 'vitest';
import { validateScene } from '../src/catalog/tools';
import { parseAnchor } from '../src/core/anchor-grammar';
import { registry } from '../src/scenes/registry';

describe.each(registry.map((c) => [c.meta.id, c] as const))('capability %s', (_id, capability) => {
  it('declares selection metadata with explicit redirections', () => {
    expect(capability.meta.useWhen.length).toBeGreaterThan(0);
    expect(capability.meta.avoidWhen.length).toBeGreaterThan(0);
    for (const entry of capability.meta.avoidWhen) {
      expect(entry).toContain('→');
    }
  });

  it('declares durations that make sense', () => {
    expect(capability.meta.minDurationFrames).toBeGreaterThan(0);
    expect(capability.meta.recommendedDurationFrames).toBeGreaterThanOrEqual(
      capability.meta.minDurationFrames,
    );
  });

  it('declares at least one layout, each with typed internal slots', () => {
    const layouts = Object.entries(capability.layouts);
    expect(layouts.length).toBeGreaterThan(0);
    for (const [, layout] of layouts) {
      expect(layout.slots.length).toBeGreaterThan(0);
      expect(layout.description.length).toBeGreaterThan(0);
    }
  });

  it('declares a closed action vocabulary with descriptions', () => {
    if (!capability.meta.supportsEvents) return;
    const actions = Object.entries(capability.actions);
    expect(actions.length).toBeGreaterThan(0);
    for (const [, action] of actions) {
      expect(action.description.length).toBeGreaterThan(0);
    }
  });

  it('publishes soft constraints alongside the hard schema', () => {
    expect(Object.keys(capability.constraints).length).toBeGreaterThan(0);
  });

  it('ships at least three examples, including an edge case and an empty case', () => {
    expect(capability.examples.length).toBeGreaterThanOrEqual(3);
    const notes = capability.examples.map((e) => `${e.title} ${e.note}`.toLowerCase());
    expect(notes.some((n) => n.includes('edge'))).toBe(true);
    expect(notes.some((n) => n.includes('empty'))).toBe(true);
  });

  describe.each(capability.examples.map((e) => [e.id, e] as const))(
    'example %s',
    (_eid, example) => {
      it('validates against its own capability', () => {
        const report = validateScene(example);
        expect(report.errors).toEqual([]);
      });

      /**
       * `parseAnchor` rather than a regex written here. This file held a third copy of the
       * grammar, which passed only because no example used a word anchor yet — the first
       * one to try would have been rejected by a test whose subject is "is this symbolic",
       * not "is this a boundary". The grammar has one definition; this asks it.
       */
      it('expresses time symbolically — an example carrying a frame teaches the agent frames', () => {
        for (const event of example.events ?? []) {
          expect(parseAnchor(event.at)).not.toBeNull();
        }
      });

      it('names a layout that exists', () => {
        expect(Object.keys(capability.layouts)).toContain(example.layout);
      });

      it('declares the beats it spans, since duration is the sum of them', () => {
        expect(example.spansBeats.length).toBeGreaterThan(0);
      });
    },
  );
});
