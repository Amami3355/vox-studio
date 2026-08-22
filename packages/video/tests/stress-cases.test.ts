/**
 * The generator half of the content-stress suite, tested without a browser.
 *
 * `tests/stress/content-stress.test.ts` renders what this file checks. Splitting them is
 * the same move `titleFit.ts` makes against `SceneTitle`: the decision is a pure function
 * of the schema and can be asked in milliseconds, and only the *consequence* needs Chrome.
 * A generator that quietly produced two empty cases would otherwise report as a green
 * stress run over a hundred renders of nothing.
 */
import { describe, expect, it } from 'vitest';
import { buildCatalogEntry } from '../src/catalog/build';
import { registry, requireCapability } from '../src/scenes/registry';
import {
  MAX_WORD_LENGTH,
  type StressContentId,
  WIDEST_FIGURE,
  prose,
  stressCases,
  stressContent,
} from './stress/cases';

const contentFor = (capabilityId: string) => stressContent(requireCapability(capabilityId));

const at = (capabilityId: string, id: 'ceiling' | 'floor'): Record<string, unknown> => {
  const found = contentFor(capabilityId).find((one) => one.id === id);
  if (!found) throw new Error(`No ${id} content for ${capabilityId}.`);
  return found.props;
};

describe('prose fills a string to an exact length', () => {
  it('lands on the length asked for, at every length a schema can ask for', () => {
    for (let length = 0; length <= 260; length += 1) {
      expect({ length, actual: prose(length).length }).toEqual({ length, actual: length });
    }
  });

  it('is more than one token once there is room for two', () => {
    // The whole reason for a corpus. A 240-character string made of one word exercises no
    // wrapping, and wrapping is the question the suite exists to ask.
    for (const length of [20, 40, 60, 80, 120, 240]) {
      expect({ length, words: prose(length).split(' ').length }).toEqual({
        length,
        words: expect.any(Number),
      });
      expect(prose(length).split(' ').length).toBeGreaterThan(1);
    }
  });

  it('never sets a word longer than the corpus admits, so nothing is unbreakable by accident', () => {
    // An over-long token would clip for a reason the schema never claimed, and every case
    // would then be measuring the corpus instead of the layout.
    for (const length of [37, 40, 121, 240]) {
      for (const word of prose(length).split(' ')) {
        expect({ length, word, ok: word.length <= MAX_WORD_LENGTH }).toEqual({
          length,
          word,
          ok: true,
        });
      }
    }
  });

  it('is deterministic, so a red case is the same red case tomorrow', () => {
    expect(prose(240)).toBe(prose(240));
  });
});

describe('content is generated from the published schema, not written', () => {
  it('fills every bounded field to its ceiling', () => {
    expect(at('quote', 'ceiling')).toEqual({
      quote: expect.stringMatching(/^.{240}$/s),
      attribution: expect.stringMatching(/^.{60}$/s),
      role: expect.stringMatching(/^.{60}$/s),
      eyebrow: expect.stringMatching(/^.{40}$/s),
    });

    expect(at('stat_counter', 'ceiling')).toEqual({
      value: WIDEST_FIGURE,
      label: expect.stringMatching(/^.{80}$/s),
      unit: expect.stringMatching(/^.{12}$/s),
      sublabel: expect.stringMatching(/^.{120}$/s),
    });

    const chart = at('bar_chart', 'ceiling');
    expect(chart.title).toMatch(/^.{120}$/s);
    expect(chart.unit).toMatch(/^.{8}$/s);
    expect((chart.data as unknown[]).length).toBe(20);
    for (const row of chart.data as { label: string; value: number }[]) {
      expect(row.label.length).toBe(40);
      expect(Number.isFinite(row.value)).toBe(true);
    }
    // The first row carries the widest figure the formatter will ever draw, and it is
    // negative — the one documented path that recomputes the axis.
    expect((chart.data as { value: number }[])[0]?.value).toBe(WIDEST_FIGURE);
    // Twenty rows at the ceiling, and twenty *different* rows: one string repeated twenty
    // times measures one word's wrapping twenty times over, and is not a ranking.
    expect(new Set((chart.data as { label: string }[]).map((row) => row.label)).size).toBe(20);

    expect(at('image_context', 'ceiling')).toEqual({
      headline: expect.stringMatching(/^.{120}$/s),
      caption: expect.stringMatching(/^.{240}$/s),
      assetRequirement: {
        type: 'image',
        subject: expect.stringMatching(/^.{80}$/s),
      },
    });
  });

  it('takes the floor from the limits the schemas deliberately do not state', () => {
    // "No `.min(2)`, so the empty state stays reachable" is a promise with the same
    // standing as a ceiling, and nothing had ever rendered the frame it promises.
    expect(at('quote', 'floor')).toEqual({ quote: '', attribution: '', role: '', eyebrow: '' });
    expect(at('stat_counter', 'floor')).toEqual({
      value: 0,
      label: '',
      unit: '',
      sublabel: '',
    });
    expect(at('bar_chart', 'floor')).toEqual({ title: '', data: [], unit: '' });
    // `subject` is the one string with a stated `min(1)`, so its floor is one character
    // and not the empty string — a floor the schema refuses is not a floor.
    expect(at('image_context', 'floor')).toEqual({
      headline: '',
      caption: '',
      assetRequirement: { type: 'image', subject: expect.stringMatching(/^.$/) },
    });
  });

  it('covers every line-chart density regime and its late annotated ceiling', () => {
    const content = contentFor('line_chart');
    expect(content.map((one) => one.id)).toEqual([
      'floor',
      'minimum',
      'recommended',
      'degraded',
      'ceiling',
    ]);
    expect((content.find((one) => one.id === 'ceiling')?.props.points as unknown[]).length).toBe(
      36,
    );
    expect(content.find((one) => one.id === 'ceiling')?.events).toContainEqual(
      expect.objectContaining({ action: 'annotatePoint', frame: 180 }),
    );
  });

  it('leaves every choice the schema does not size to the capability', () => {
    // `gridlines`, `emphasis`, `treatment`, `orientation` are choices, not sizes; an
    // optional `highlight` or `identityKey` is a choice too. The generator fills what the
    // schema gives it a size for and lets the defaults stand, so a case never silently
    // asserts a variant nobody chose.
    for (const content of [at('bar_chart', 'ceiling'), at('bar_chart', 'floor')]) {
      expect(content).not.toHaveProperty('gridlines');
      expect(content).not.toHaveProperty('emphasis');
      expect(content).not.toHaveProperty('highlight');
    }
    for (const content of [at('image_context', 'ceiling'), at('image_context', 'floor')]) {
      const requirement = content.assetRequirement as Record<string, unknown>;
      expect(requirement).not.toHaveProperty('treatment');
      expect(requirement).not.toHaveProperty('orientation');
      expect(requirement).not.toHaveProperty('identityKey');
    }
  });

  it('generates props the capability actually accepts', () => {
    // The generator reads the *published* projection of the schema, so this is the join
    // that keeps the two readings honest: whatever it derives from the manifest has to
    // survive the zod schema the manifest was derived from.
    for (const capability of registry) {
      for (const content of stressContent(capability)) {
        expect(() => capability.schema.parse(content.props)).not.toThrow();
      }
    }
  });
});

describe('the matrix is every layout by every composition by both profiles', () => {
  const cases = stressCases();

  it('has a case for every declared arrangement of every capability', () => {
    // Generated, so an empty or half-built matrix would report as a pass. The count is
    // stated as its factors rather than as a number, because the point of the list is
    // that adding a layout or a composition adds cases without anyone editing this file.
    const arrangements = registry.reduce(
      (total, capability) =>
        total +
        Object.keys(capability.layouts).length *
          capability.meta.supportedCompositions.length *
          stressContent(capability).length,
      0,
    );
    expect(cases.length).toBe(arrangements * 2);
  });

  it('names each case by everything that varies in it', () => {
    expect(new Set(cases.map((one) => one.label)).size).toBe(cases.length);
    expect(cases.map((one) => one.label)).toContain(
      'quote at its ceiling, centered, composed into left under pushIn',
    );
    expect(cases.map((one) => one.label)).toContain(
      'bar_chart at its floor, withCallout, composed into full under cinematic',
    );
  });

  it('renders each case at the two frames the cameras are extreme at', () => {
    for (const one of cases) {
      const duration = requireCapability(one.capabilityId).meta.recommendedDurationFrames;
      expect({ label: one.label, frames: one.frames }).toEqual({
        label: one.label,
        frames: [Math.round(duration * 0.25), duration - 1],
      });
    }
  });
});

/**
 * A capability may supply its own stress shapes when the generic filler cannot size them —
 * `line_chart` aligns `series[].values` with `points` and needs its dates to parse. The
 * hook is held to the rule the generator is held to, and this is what holds it: every count
 * and every length it produces has to be the one the projection publishes.
 *
 * Without this the hook would be the hand-written fixture the suite's header exists to
 * refuse, just relocated into a capability folder. Raise a ceiling in `schema.ts` and the
 * ceiling case must move with it; lower a `recommendedMax` in `constraints.ts` and the
 * degraded case must follow.
 */
describe('a capability that supplies its own stress shapes still reads its published limits', () => {
  const supplying = registry.filter((capability) => capability.stressContent !== undefined);

  it('has at least one, or this suite is asserting nothing', () => {
    expect(supplying.length).toBeGreaterThan(0);
  });

  it.each(supplying.map((capability) => [capability.meta.id, capability] as const))(
    '%s reaches every published ceiling and recommendation',
    (_id, capability) => {
      const entry = buildCatalogEntry(capability);
      const properties = (entry.propsSchema.properties ?? {}) as Record<
        string,
        { maxItems?: number; maxLength?: number }
      >;

      const byRegime = new Map(stressContent(capability).map((shape) => [shape.id, shape.props]));
      expect([...byRegime.keys()].sort()).toEqual([
        'ceiling',
        'degraded',
        'floor',
        'minimum',
        'recommended',
      ]);

      /** A string's length and an array's length are the same published question. */
      const sizeIn = (regime: StressContentId, name: string): number | undefined => {
        const value = byRegime.get(regime)?.[name];
        if (typeof value === 'string') return value.length;
        return Array.isArray(value) ? value.length : undefined;
      };

      for (const [name, constraint] of Object.entries(entry.softConstraints)) {
        const published = properties[name];
        const ceiling = published?.maxItems ?? published?.maxLength;

        if (ceiling !== undefined) {
          expect({ field: name, regime: 'ceiling', size: sizeIn('ceiling', name) }).toEqual({
            field: name,
            regime: 'ceiling',
            size: ceiling,
          });
        }

        if (constraint.recommendedMax !== undefined && published?.maxItems !== undefined) {
          expect({ field: name, size: sizeIn('recommended', name) }).toEqual({
            field: name,
            size: constraint.recommendedMax,
          });
          expect({ field: name, size: sizeIn('degraded', name) }).toEqual({
            field: name,
            size: constraint.recommendedMax + 1,
          });
        }
      }

      // The floor is the shape every deliberately absent `.min()` promises stays reachable.
      const floor = byRegime.get('floor') ?? {};
      for (const [name, value] of Object.entries(floor)) {
        expect({ field: name, empty: (value as string | unknown[]).length }).toEqual({
          field: name,
          empty: 0,
        });
      }
    },
  );
});
