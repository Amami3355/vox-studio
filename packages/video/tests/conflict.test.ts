/**
 * ADR-0003's ladder, at its own seam: a pure function over *declarations*. No plan, no
 * frame, no section — only the four facts the rule actually reads.
 */
import { describe, expect, it } from 'vitest';
import { resolveConflict } from '../src/compile/conflict';
import { requireCapability } from '../src/scenes/registry';

describe('slot conflict resolution', () => {
  it('leaves both declarations alone when the element is clear of the scene', () => {
    const outcome = resolveConflict(
      { occupies: ['bottom', 'left'], supportedCompositions: ['full', 'left', 'right'] },
      { wanted: 'cornerTR', declaredElsewhere: [] },
    );

    expect(outcome).toEqual({ kind: 'keep' });
  });

  it('makes the scene yield into a composition it declared, before moving the element', () => {
    const outcome = resolveConflict(
      { occupies: ['bottom', 'left'], supportedCompositions: ['full', 'left', 'right'] },
      { wanted: 'cornerBR', declaredElsewhere: ['cornerTL'] },
    );

    expect(outcome).toEqual({ kind: 'recompose', composition: 'left' });
  });

  it('moves the element to a slot it already uses when the scene cannot yield', () => {
    const outcome = resolveConflict(
      { occupies: ['bottom', 'left'], supportedCompositions: ['full'] },
      { wanted: 'cornerBR', declaredElsewhere: ['cornerTR'] },
    );

    expect(outcome).toEqual({ kind: 'relocate', slot: 'cornerTR' });
  });

  it('never invents a free slot the element does not already occupy', () => {
    const outcome = resolveConflict(
      { occupies: ['bottom', 'left'], supportedCompositions: ['full'] },
      { wanted: 'cornerBR', declaredElsewhere: [] },
    );

    expect(outcome).toEqual({ kind: 'hide' });
  });

  /**
   * The case that forced ADR-0003, read from the real declarations rather than a fixture:
   * if `image_context` ever softens `occupiesRegions` or gains a composition it can be
   * squeezed into, this is the test that says the rule's outcome moved with it.
   */
  it('hides a persistent element over a scene that occupies the whole frame', () => {
    const { meta } = requireCapability('image_context');

    const outcome = resolveConflict(
      { occupies: meta.occupiesRegions, supportedCompositions: meta.supportedCompositions },
      { wanted: 'cornerBR', declaredElsewhere: ['cornerTL', 'left', 'center'] },
    );

    expect(outcome).toEqual({ kind: 'hide' });
  });
});
