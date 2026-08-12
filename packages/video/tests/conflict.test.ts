/**
 * ADR-0003's ladder, at its own seam: a pure function over *declarations*. No plan, no
 * frame, no section — only the facts the rule actually reads.
 *
 * The unit is the scene, so the table is a table of scenes: one occupation, the elements
 * that cross it, one composition and one outcome each out the other side.
 */
import { describe, expect, it } from 'vitest';
import { type SceneOccupation, resolveSceneConflicts } from '../src/compile/conflict';
import { requireCapability } from '../src/scenes/registry';

/** `bar_chart`'s real shape: it can yield into a half, and only `cornerTR` clears it. */
const yielding: SceneOccupation = {
  occupies: ['bottom', 'left'],
  supportedCompositions: ['full', 'left', 'right'],
};

/** The same occupancy with nothing to yield into, which forces the lower rungs. */
const rigid: SceneOccupation = {
  occupies: ['bottom', 'left'],
  supportedCompositions: ['full'],
};

describe('slot conflict resolution', () => {
  it('leaves both declarations alone when the element is clear of the scene', () => {
    const resolution = resolveSceneConflicts(yielding, [
      { wanted: ['cornerTR'], declaredElsewhere: [] },
    ]);

    expect(resolution).toEqual({ composition: null, outcomes: [{ kind: 'keep' }] });
  });

  it('makes the scene yield into a composition it declared, before moving the element', () => {
    const resolution = resolveSceneConflicts(yielding, [
      { wanted: ['cornerBR'], declaredElsewhere: ['cornerTR'] },
    ]);

    expect(resolution).toEqual({ composition: 'left', outcomes: [{ kind: 'sceneYielded' }] });
  });

  it('moves the element to a slot it already uses when the scene cannot yield', () => {
    const resolution = resolveSceneConflicts(rigid, [
      { wanted: ['cornerBR'], declaredElsewhere: ['cornerTR'] },
    ]);

    expect(resolution).toEqual({
      composition: null,
      outcomes: [{ kind: 'relocate', slot: 'cornerTR' }],
    });
  });

  it('never invents a free slot the element does not already occupy', () => {
    const resolution = resolveSceneConflicts(rigid, [
      { wanted: ['cornerBR'], declaredElsewhere: [] },
    ]);

    expect(resolution).toEqual({ composition: null, outcomes: [{ kind: 'hide' }] });
  });

  /**
   * The case that forced ADR-0003, read from the real declarations rather than a fixture.
   * It hid the element until `image_context` gained a half-frame layout: the scene takes
   * the whole canvas, so the corner is only free if the scene itself gives it up.
   *
   * Note which repair wins. The element declares `cornerTL` elsewhere and would have been
   * relocatable, but the scene yields first — a composition somebody designed, against a
   * character that jumps. If this ever reads `relocate`, rung b and rung c have swapped.
   */
  it('makes the scene that occupies the whole frame yield rather than move the element', () => {
    const { meta } = requireCapability('image_context');

    const resolution = resolveSceneConflicts(
      { occupies: meta.occupiesRegions, supportedCompositions: meta.supportedCompositions },
      [{ wanted: ['cornerBR'], declaredElsewhere: ['cornerTL', 'left', 'center'] }],
    );

    expect(resolution).toEqual({ composition: 'left', outcomes: [{ kind: 'sceneYielded' }] });
  });

  /** And when the halves cannot clear it either, the element still goes. */
  it('still hides an element no declared composition of that scene can clear', () => {
    const { meta } = requireCapability('image_context');

    const resolution = resolveSceneConflicts(
      { occupies: meta.occupiesRegions, supportedCompositions: meta.supportedCompositions },
      [{ wanted: ['center'], declaredElsewhere: [] }],
    );

    expect(resolution).toEqual({ composition: null, outcomes: [{ kind: 'hide' }] });
  });

  /**
   * ADR-0003 decision 2. An element that moves *inside* the scene asks the scene to clear
   * both of its slots at once. `left` clears `cornerBR` and `right` clears `cornerBL`, and
   * a compiler that picked either would leave the element inside the frame it just chose.
   */
  it('will not yield into a composition that clears only part of what an element occupies', () => {
    const resolution = resolveSceneConflicts(yielding, [
      { wanted: ['cornerBR', 'cornerBL'], declaredElsewhere: [] },
    ]);

    expect(resolution).toEqual({ composition: null, outcomes: [{ kind: 'hide' }] });
  });

  it('gives an element that moves inside the scene one slot for the scene’s duration', () => {
    const resolution = resolveSceneConflicts(yielding, [
      { wanted: ['cornerBR', 'cornerBL'], declaredElsewhere: ['cornerTR'] },
    ]);

    expect(resolution).toEqual({
      composition: null,
      outcomes: [{ kind: 'relocate', slot: 'cornerTR' }],
    });
  });

  /**
   * The scene yields for everyone or for no one. Yielding for one element while a second
   * still has to move buys a smaller frame *and* a character that jumps — both repairs,
   * for the benefit of one.
   */
  it('keeps the scene at its authored composition when no single composition clears every element', () => {
    const resolution = resolveSceneConflicts(yielding, [
      { wanted: ['cornerBR'], declaredElsewhere: ['cornerTR'] },
      { wanted: ['cornerBL'], declaredElsewhere: ['cornerTR'] },
    ]);

    expect(resolution).toEqual({
      composition: null,
      outcomes: [{ kind: 'relocate', slot: 'cornerTR' }, { kind: 'hide' }],
    });
  });

  it('yields once for every element that contended, and reports nothing for those that did not', () => {
    const resolution = resolveSceneConflicts(yielding, [
      { wanted: ['cornerBR'], declaredElsewhere: [] },
      { wanted: ['cornerTR'], declaredElsewhere: [] },
    ]);

    expect(resolution).toEqual({
      composition: 'left',
      outcomes: [{ kind: 'sceneYielded' }, { kind: 'keep' }],
    });
  });

  /** A relocation target must clear the scene *and* every element that is not moving. */
  it('refuses a relocation target that an element staying put already holds', () => {
    const resolution = resolveSceneConflicts(rigid, [
      { wanted: ['cornerTR'], declaredElsewhere: [] },
      { wanted: ['cornerBR'], declaredElsewhere: ['cornerTR'] },
    ]);

    expect(resolution).toEqual({
      composition: null,
      outcomes: [{ kind: 'keep' }, { kind: 'hide' }],
    });
  });
});
