import { describe, expect, it } from 'vitest';
import {
  UnknownAnchorError,
  resolveAnchor,
  resolveEventTimings,
  syntheticBeats,
} from '../src/core/anchors';

const beats = syntheticBeats(['b1', 'b2', 'b3'], 300);
const bounds = { from: 0, to: 300 };

describe('syntheticBeats', () => {
  it('splits the duration evenly and covers it exactly', () => {
    expect(beats).toEqual([
      { id: 'b1', from: 0, to: 100 },
      { id: 'b2', from: 100, to: 200 },
      { id: 'b3', from: 200, to: 300 },
    ]);
  });

  it('falls back to a single beat when none are declared', () => {
    expect(syntheticBeats([], 120)).toEqual([{ id: 'b1', from: 0, to: 120 }]);
  });
});

describe('resolveAnchor', () => {
  it('resolves start, mid and end', () => {
    expect(resolveAnchor('b2.start', beats, bounds)).toBe(100);
    expect(resolveAnchor('b2.mid', beats, bounds)).toBe(150);
    expect(resolveAnchor('b2.end', beats, bounds)).toBe(200);
  });

  it('applies symbolic offsets in both directions', () => {
    expect(resolveAnchor('b2.start+short', beats, bounds)).toBe(112);
    expect(resolveAnchor('b2.start-short', beats, bounds)).toBe(88);
    expect(resolveAnchor('b2.start+long', beats, bounds)).toBe(134);
  });

  it('accepts scene as a pseudo-beat', () => {
    expect(resolveAnchor('scene.end', beats, bounds)).toBe(300);
    expect(resolveAnchor('scene.end-short', beats, bounds)).toBe(288);
  });

  it('clamps inside the scene rather than emitting a negative frame', () => {
    expect(resolveAnchor('b1.start-long', beats, bounds)).toBe(0);
    expect(resolveAnchor('b3.end+long', beats, bounds)).toBe(300);
  });

  it('fails loudly on an unknown beat, listing what exists', () => {
    expect(() => resolveAnchor('b9.start', beats, bounds)).toThrow(UnknownAnchorError);
    try {
      resolveAnchor('b9.start', beats, bounds);
    } catch (error) {
      expect((error as UnknownAnchorError).message).toContain('b1, b2, b3');
    }
  });

  it('fails loudly on malformed syntax', () => {
    expect(() => resolveAnchor('b1', beats, bounds)).toThrow(UnknownAnchorError);
    expect(() => resolveAnchor('b1.middle', beats, bounds)).toThrow(UnknownAnchorError);
    expect(() => resolveAnchor('frame 312', beats, bounds)).toThrow(UnknownAnchorError);
  });
});

describe('resolveEventTimings', () => {
  it('emits frames relative to the start of the scene and keeps payloads', () => {
    const timed = resolveEventTimings(
      [
        { at: 'b1.start', action: 'showBaseline' },
        { at: 'b3.start', action: 'highlightBar', payload: { label: 'London' } },
      ],
      beats,
      bounds,
    );
    expect(timed).toEqual([
      { frame: 0, action: 'showBaseline' },
      { frame: 200, action: 'highlightBar', payload: { label: 'London' } },
    ]);
  });
});
