import { describe, expect, it } from 'vitest';
import {
  type FrameBeat,
  UnknownAnchorError,
  UnresolvableWordError,
  resolveAnchor,
  resolveEventTimings,
  syntheticBeats,
} from '../src/core/anchors';

const beats = syntheticBeats(['b1', 'b2', 'b3'], 300);
const bounds = { from: 0, to: 300 };

describe('syntheticBeats', () => {
  it('splits the duration evenly and covers it exactly, and speaks no words', () => {
    expect(beats).toEqual([
      { id: 'b1', from: 0, to: 100, words: [] },
      { id: 'b2', from: 100, to: 200, words: [] },
      { id: 'b3', from: 200, to: 300, words: [] },
    ]);
  });

  it('fabricates no beat when none are declared, so anchors fail loudly instead', () => {
    expect(syntheticBeats([], 120)).toEqual([]);
    expect(() => resolveAnchor('b1.start', syntheticBeats([], 120), { from: 0, to: 120 })).toThrow(
      UnknownAnchorError,
    );
  });
});

describe('resolveAnchor', () => {
  it('resolves start and end', () => {
    expect(resolveAnchor('b2.start', beats, bounds)).toBe(100);
    expect(resolveAnchor('b2.end', beats, bounds)).toBe(200);
  });

  /**
   * The decision of ADR-0010, guarded where it is cheapest to guard. `mid` parsed and
   * resolved for two manifest versions, so its absence is a deliberate narrowing and not
   * an oversight — and an agent trained on `manifestVersion: 3` will still write it.
   * A rejection is the only thing that tells such an agent the form is gone; resolving it
   * to the halfway frame is what made a callout overtake its own bar.
   */
  it('rejects the retired midpoint form rather than resolving it', () => {
    expect(() => resolveAnchor('b2.mid', beats, bounds)).toThrow(UnknownAnchorError);
    expect(() => resolveAnchor('b2.mid-short', beats, bounds)).toThrow(UnknownAnchorError);
    expect(() => resolveAnchor('scene.mid', beats, bounds)).toThrow(UnknownAnchorError);
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

/**
 * The vocabulary that repairs "the events do not land on the words".
 *
 * ADR-0002 left snapping an arithmetic anchor to the nearest word as the open repair.
 * Measured against the shipped take it was the wrong one: the worst failure in the slice —
 * `highlightBar` on London — already sat exactly on a word onset, and the onset was
 * "Berlin"'s. Precision was never what was missing. The ability to say *which word* was.
 */
describe('word anchors', () => {
  /** A take, so the words are measured rather than fabricated. `syntheticBeats` has none. */
  const spoken: FrameBeat[] = [
    {
      id: 'b1',
      from: 0,
      to: 100,
      words: [
        { text: 'Rent', frame: 0 },
        { text: 'has', frame: 20 },
        { text: 'climbed', frame: 55 },
      ],
    },
    {
      id: 'b2',
      from: 100,
      to: 200,
      words: [
        { text: 'In', frame: 100 },
        { text: 'London', frame: 121 },
        { text: 'rent', frame: 160 },
        { text: 'beats', frame: 180 },
        { text: 'rent', frame: 190 },
      ],
    },
  ];

  it('resolves to the frame the word begins on', () => {
    expect(resolveAnchor('b2.word:London', spoken, bounds)).toBe(121);
    expect(resolveAnchor('b1.word:climbed', spoken, bounds)).toBe(55);
  });

  /**
   * The assertion that says why this vocabulary exists rather than a snapping rule. `b2`'s
   * edges are 100 and 200; "London" is at 121, which is not the nearest anything. No
   * arithmetic over this beat produces it — and since ADR-0010 retired the midpoint, the
   * arithmetic branch reaches even less of the beat than when this test was written.
   */
  it('reaches a frame no boundary or offset of that beat can', () => {
    const arithmetic = [
      resolveAnchor('b2.start', spoken, bounds),
      resolveAnchor('b2.end', spoken, bounds),
      resolveAnchor('b2.start+short', spoken, bounds),
      resolveAnchor('b2.start+long', spoken, bounds),
      resolveAnchor('b2.end-short', spoken, bounds),
      resolveAnchor('b2.end-long', spoken, bounds),
    ];

    expect(arithmetic).not.toContain(121);
  });

  it('refuses a word the beat does not speak, and lists the ones it does', () => {
    expect(() => resolveAnchor('b2.word:Berlin', spoken, bounds)).toThrow(UnresolvableWordError);
    try {
      resolveAnchor('b2.word:Berlin', spoken, bounds);
    } catch (error) {
      expect((error as Error).message).toContain('In, London, rent, beats, rent');
    }
  });

  /**
   * The decision this vocabulary turns on. Resolving to the first "rent" would be a silent
   * choice of which word the picture cuts on — the exact failure the vocabulary exists to
   * prevent, arriving through the mechanism built to prevent it.
   */
  it('refuses a word the beat speaks twice rather than picking one', () => {
    expect(() => resolveAnchor('b2.word:rent', spoken, bounds)).toThrow(UnresolvableWordError);
    try {
      resolveAnchor('b2.word:rent', spoken, bounds);
    } catch (error) {
      expect((error as Error).message).toContain('appears 2 times');
    }
  });

  /** The same word in a *different* beat is not ambiguous — scope is the beat. */
  it('resolves a word that is repeated across beats but unique within one', () => {
    expect(resolveAnchor('b1.word:has', spoken, bounds)).toBe(20);
  });

  /**
   * A synthetic take can answer where a beat begins and never when a word was spoken.
   * Fabricating an onset from a duration would produce a number indistinguishable from a
   * measured one, which is the failure mode this whole increment removes.
   */
  it('refuses a word anchor against a take that has no words', () => {
    expect(() => resolveAnchor('b2.word:London', beats, bounds)).toThrow(UnresolvableWordError);
  });

  it('refuses a word on the scene pseudo-beat, which has bounds and no text', () => {
    expect(() => resolveAnchor('scene.word:London', spoken, bounds)).toThrow(UnresolvableWordError);
  });

  /**
   * `-long` is an offset and a hyphen is a word character, so `b2.word:month-long` could
   * only ever be read one way — and English has enough `-long` compounds that guessing
   * would be a real misparse rather than a hypothetical one. A word anchor names the word
   * and nothing else; the next word is what "slightly later" means here.
   */
  it('takes no offset, so a hyphenated word cannot be misread as one', () => {
    expect(() => resolveAnchor('b2.word:London+short', spoken, bounds)).toThrow(UnknownAnchorError);
  });

  it("treats an apostrophe as inside a word and doesn't split on it", () => {
    const withApostrophe: FrameBeat[] = [
      { id: 'b1', from: 0, to: 100, words: [{ text: "Europe's", frame: 12 }] },
    ];
    expect(resolveAnchor("b1.word:Europe's", withApostrophe, bounds)).toBe(12);
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
