/**
 * The catalog entry checklist, enforced.
 *
 * Every capability added to the registry must clear these before it is usable by an
 * agent. This is the checklist from the frozen architecture doc, turned into something
 * that fails a build instead of something someone remembers to read.
 */
import { describe, expect, it } from 'vitest';
import { buildCatalog, buildCatalogEntry, buildPlanContract } from '../src/catalog/build';
import { validateScene } from '../src/catalog/tools';
import { parseAnchor } from '../src/core/anchor-grammar';
import { COMPILER_CHECKS } from '../src/core/compiler-checks';
import { registry } from '../src/scenes/registry';

/**
 * What the manifest must publish before any capability in it is usable.
 *
 * Rule 2 says the agent sees the manifest and never the code, which makes anything the
 * agent must write and the manifest does not mention unlearnable by construction. The
 * anchor grammar was exactly that: `catalog.json` contained no mention of anchors at all
 * while every event in every example is anchored.
 */
describe('the manifest', () => {
  it('publishes the canonical compiler-check registry once in catalog v3', () => {
    const catalog = buildCatalog();

    expect(catalog.manifestVersion).toBe(4);
    expect(catalog.checks).toBe(COMPILER_CHECKS);

    const entries = [
      ...Object.entries(catalog.checks.errors),
      ...Object.entries(catalog.checks.warnings),
    ];
    expect(new Set(entries.map(([, check]) => check.code)).size).toBe(entries.length);

    for (const [key, check] of entries) {
      expect(check.code).toBe(key);
      expect(check.means.trim().length).toBeGreaterThan(20);
      expect(check.repair.trim().length).toBeGreaterThan(20);
      expect(check.means.trim().toUpperCase()).not.toBe(check.code);
      expect(check.repair.trim().toUpperCase()).not.toBe(check.code);
    }
  });

  it('publishes strict schema-valid and semantically valid full-plan examples', () => {
    const contract = buildPlanContract();

    expect(contract.contractVersion).toBe(1);
    expect(contract.schema.additionalProperties).toBe(false);
    expect(contract.examples.length).toBeGreaterThanOrEqual(2);

    const projected = JSON.stringify(contract.examples);
    for (const forbidden of ['fromMs', 'toMs', 'durationInFrames', 'frame', 'frames']) {
      expect(projected).not.toContain(`"${forbidden}"`);
    }

    const demonstrations = contract.examples.flatMap((example) => example.demonstrates);
    expect(demonstrations).toEqual(
      expect.arrayContaining([
        'multiple capabilities',
        'persistent elements',
        'placements',
        'events',
        'word anchor',
      ]),
    );
  });

  /**
   * Asked through `parseAnchor` rather than compared against the grammar's own string,
   * which would recompute the expectation the way the code does and pass by construction.
   * The parser is the independent source of truth here — it is what will actually reject
   * the agent's anchor — so a published form the parser does not accept is the defect this
   * catches, and it is a live one: the grammar has already existed in three drifting copies
   * in this repository.
   */
  it('publishes an anchor grammar whose own examples parse, covering both branches', () => {
    const { time } = buildCatalog();
    const examples = time.forms.flatMap((form) => form.examples);

    expect(examples.length).toBeGreaterThan(0);
    for (const example of examples) {
      expect(parseAnchor(example), `manifest publishes "${example}"`).not.toBeNull();
    }

    const kinds = new Set(examples.map((example) => parseAnchor(example)?.target.kind));
    expect(kinds).toEqual(new Set(['boundary', 'word']));
  });
});

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

  /**
   * A declaration the manifest drops is a declaration only the test suite can act on, and
   * the whole argument for moving this off a hardcoded list in `plans.test.ts` was that the
   * agent could use it as well as the test can. Rule 2: the agent sees the manifest.
   */
  it('publishes each action’s deictic fields, not only the code’s copy of them', () => {
    const published = new Map(
      buildCatalogEntry(capability).actions.map((action) => [action.id, action.deicticFields]),
    );

    for (const [id, action] of Object.entries(capability.actions)) {
      expect(published.get(id), `action "${id}"`).toEqual(action.deicticFields);
    }
  });

  /**
   * The declaration is a set of field *names*, so it can name a field that does not exist —
   * and the failure is silent in the worst way. `deicticFields: ['labell']` reads a payload
   * key that is never there, produces no word to check, and the landing gate goes green by
   * finding nothing to look at. That is the same "renders fine, animates nothing" species
   * the closed action vocabulary exists to kill, one level up.
   */
  it('names deictic fields the payload actually carries', () => {
    for (const action of buildCatalogEntry(capability).actions) {
      if (!action.deicticFields) continue;
      const carried = Object.keys((action.payloadSchema?.properties ?? {}) as object);
      expect(action.deicticFields.length, `action "${action.id}"`).toBeGreaterThan(0);
      for (const field of action.deicticFields) {
        expect(carried, `action "${action.id}"`).toContain(field);
      }
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
