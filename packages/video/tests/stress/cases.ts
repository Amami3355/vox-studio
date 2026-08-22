/**
 * The cases of the content-stress suite, derived rather than written.
 *
 * ADR-0003's amendment of 2026-08-13 settled that eligibility is static and fit is not:
 * *may* `bar_chart` be composed into `left` is a property of the capability, which
 * `tests/render/safe-area.test.ts` now checks, and *does this instance's 120-character
 * headline survive the column it landed in* is a property of one plan's content, which
 * nothing checked at all. The degradations for oversized content already exist and already
 * work — `titleStep` drops the scale, the `Others` bucket folds a twenty-category ranking,
 * `composedStepCeiling` sets a composed scene quieter. What was missing is that **no one
 * had ever rendered them**.
 *
 * So the cases come from the schema and not from a fixture file. Every `.max()` is a
 * ceiling the catalog publishes to the agent, and every deliberately absent `.min()` is a
 * floor it publishes just as loudly — "no `.min(2)`, so the empty state stays reachable"
 * is a promise with the same standing as a limit. A hand-written fixture would state those
 * numbers a second time, and the second copy is the one that goes stale: raising a ceiling
 * in `schema.ts` would leave the suite quietly stressing the old one.
 *
 * It reads the **published projection** — `buildCatalogEntry(capability).propsSchema`, the
 * JSON Schema in `catalog.json` — rather than the zod object it is built from. Same source
 * of truth one step later, and the step that matters: the ceiling being stressed is the
 * ceiling the agent was told about. `stress-cases.test.ts` closes the loop by parsing every
 * generated case back through the zod schema.
 *
 * What the generator will not do is choose. A `.max()` is a size and the generator can
 * take it to its limit; `gridlines`, `emphasis`, `treatment` are choices between frames
 * that are each the right size, and a generator picking among them would be writing
 * examples under another name. Fields the schema does not size keep their defaults, and
 * `docs/adding-a-capability.md`'s controls are where a chosen variant belongs.
 */
import type { JsonSchemaObject } from '../../src/catalog/build';
import { buildCatalogEntry } from '../../src/catalog/build';
import { slotRect } from '../../src/core/slots';
import type {
  SafeArea,
  SceneCapability,
  Slot,
  StressRegime,
  TimedEvent,
} from '../../src/core/types';
import { type MotionProfileId, motionProfileIds } from '../../src/design/motion';
import { registry } from '../../src/scenes/registry';

/**
 * Prose, cycled, because a string at its ceiling made of one token exercises no wrapping
 * and wrapping is the whole question. The register is the housing material the repository's
 * own controls and examples are written in, so a still from this suite reads as a frame
 * somebody might have planned rather than as lorem ipsum.
 */
const CORPUS = [
  'rents',
  'in',
  'the',
  'northern',
  'cities',
  'climbed',
  'again',
  'this',
  'year',
  'and',
  'households',
  'already',
  'spending',
  'half',
  'their',
  'income',
  'on',
  'housing',
  'absorbed',
  'all',
  'of',
  'it',
];

/**
 * One word of every length, so a string can be landed on its ceiling *exactly*.
 *
 * A ceiling approached to within a few characters is not the ceiling: the schema publishes
 * 240, the agent may write 240, and the frame that has never been drawn is the one at 240.
 * The last word of every generated string comes from here.
 */
const WORDS_BY_LENGTH = [
  '',
  'a',
  'of',
  'the',
  'rent',
  'again',
  'budget',
  'climbed',
  'families',
  'household',
  'difference',
  'settlements',
  'householders',
];

/** The longest word the corpus will set. Nothing here is unbreakable by accident. */
export const MAX_WORD_LENGTH = WORDS_BY_LENGTH.length - 1;

/**
 * The widest figure the formatter will draw, and negative.
 *
 * The schemas bound their strings and say nothing about their numbers, so this is the one
 * ceiling the generator supplies rather than reads — and it is supplied to match a number
 * this repository already committed to: `stat-ceiling` in `runtime/SceneControl.tsx` is a
 * signed seven-digit value, for the same reason. Negative because `formatValue` adds a
 * sign, which is the widest the figure ever sets, and because a negative value is the one
 * documented path that recomputes a chart's axis.
 */
export const WIDEST_FIGURE = -9_999_999;

/**
 * A string of exactly `length` characters, in whole words.
 *
 * The corpus is cycled for the body and `WORDS_BY_LENGTH` lands the tail, so the result is
 * multi-word, deterministic, and exactly as long as it was asked to be.
 *
 * `from` rotates the corpus without changing the length, which is what keeps twenty
 * ceiling-length category labels twenty *different* ceiling-length labels. Twenty copies of
 * one string is a narrower question than the schema asks: it measures one word's wrapping
 * twenty times over, and a chart whose rows are indistinguishable is not a ranking anyone
 * would look at to judge whether the frame survived.
 */
export const prose = (length: number, from = 0): string => {
  if (length <= 0) return '';
  if (length <= MAX_WORD_LENGTH) return WORDS_BY_LENGTH[length] as string;

  const words: string[] = [];
  let used = 0;
  let cursor = from;

  while (used < length) {
    /** What is left for the next word, after the space that precedes it. */
    const want = used === 0 ? length : length - used - 1;

    if (want <= MAX_WORD_LENGTH) {
      words.push(WORDS_BY_LENGTH[want] as string);
      used += want + (used === 0 ? 0 : 1);
      break;
    }

    /**
     * Any corpus word fits, but not one that would leave a single character behind: a
     * remainder of one is a space with nothing after it, and there is no word of length
     * zero to end on.
     */
    let word = CORPUS[cursor % CORPUS.length] as string;
    while (word.length > want - 2) {
      cursor += 1;
      word = CORPUS[cursor % CORPUS.length] as string;
    }
    cursor += 1;

    words.push(word);
    used += word.length + (used === 0 ? 0 : 1);
  }

  return words.join(' ');
};

/**
 * The figure at position `index` of a series.
 *
 * A ranking rather than twenty copies of the same number: twenty identical bars are not a
 * ranking, and the `Others` aggregation the ceiling exists to provoke is about which bars
 * are weakest. The widest figure leads it, so the axis and the label column are both at
 * their worst in the same frame.
 */
const figureAt = (index: number): number =>
  index === 0 ? WIDEST_FIGURE : Math.round(Math.abs(WIDEST_FIGURE) / (index + 1));

/**
 * Re-exported rather than declared, so the suite and the capabilities that supply their own
 * shapes name the same five regimes from one place.
 */
export type StressContentId = StressRegime;

export type StressContent = {
  id: StressContentId;
  props: Record<string, unknown>;
  /** Resolved control timing. Present only when temporal state is itself under stress. */
  events?: TimedEvent[];
};

const fillField = (
  field: JsonSchemaObject,
  mode: StressContentId,
  index: number,
  path: string,
): unknown => {
  /**
   * An enum is a choice between frames that are each the right size, so it is only filled
   * where the schema requires a value at all, and then with the first member — the one the
   * capability wrote down first.
   */
  if (Array.isArray(field.enum)) return field.enum[0];

  switch (field.type) {
    case 'string': {
      const max = field.maxLength as number | undefined;
      const min = (field.minLength as number | undefined) ?? 0;
      if (max === undefined) {
        throw new Error(
          `Cannot size the required string at "${path}": it publishes no maxLength. Either bound it in the schema, or give the capability a control for it.`,
        );
      }
      return prose(mode === 'ceiling' ? max : min, index);
    }

    case 'number':
    case 'integer':
      return mode === 'ceiling' ? figureAt(index) : 0;

    case 'boolean':
      return field.default ?? true;

    case 'array': {
      const max = field.maxItems as number | undefined;
      if (max === undefined) {
        throw new Error(`Cannot size the required array at "${path}": it publishes no maxItems.`);
      }
      const items = (field.items ?? {}) as JsonSchemaObject;
      return mode === 'ceiling'
        ? Array.from({ length: max }, (_, at) => fillField(items, mode, at, `${path}[]`))
        : [];
    }

    case 'object':
      return fillObject(field, mode, index, path);

    default:
      throw new Error(`Cannot size the required field at "${path}": unknown type.`);
  }
};

const fillObject = (
  schema: JsonSchemaObject,
  mode: StressContentId,
  index: number,
  path: string,
): Record<string, unknown> => {
  const properties = (schema.properties ?? {}) as Record<string, JsonSchemaObject>;
  const required = new Set((schema.required as string[] | undefined) ?? []);
  const filled: Record<string, unknown> = {};

  for (const [name, field] of Object.entries(properties)) {
    /**
     * Filled when the schema asks for it, or when it both has a default and a size. What
     * is skipped is the optional field with no stated size — `highlight`, `identityKey` —
     * which is an authoring decision rather than a limit, and the defaulted field the
     * schema gives no size to, whose default is the capability's own choice and not the
     * generator's to overrule.
     */
    const sized = field.maxLength !== undefined || field.maxItems !== undefined;
    if (!required.has(name) && !(sized && 'default' in field)) continue;

    filled[name] = fillField(field, mode, index, path === '' ? name : `${path}.${name}`);
  }

  return filled;
};

/**
 * What a capability's schema admits, at the ends it publishes.
 *
 * Two ends and not a sample in between: the schema's own statements are the ceiling and the
 * silence where a floor would be, and anything between them is a number somebody chose. A
 * case at 137 characters would be a fixture wearing a generator's clothes.
 *
 * A capability may declare `stressContent` when its shape is not per-field — `line_chart`
 * aligns `series[].values` with `points` and needs its dates to parse, and no filler that
 * sizes one field at a time can honour either. That hook is held to the same rule this file
 * is: it is handed the published projection and must read its counts from it. What it may
 * do that a generator may not is choose a *shape* at a given size, which is the same
 * division `docs/adding-a-capability.md` draws for controls.
 *
 * The regime ids stay one vocabulary. A hook returning something outside `STRESS_REGIMES`
 * fails here by name rather than producing a case the sweep silently cannot label.
 */
const STRESS_REGIMES: readonly StressRegime[] = [
  'floor',
  'minimum',
  'recommended',
  'degraded',
  'ceiling',
];

export const stressContent = (capability: SceneCapability): StressContent[] => {
  const { propsSchema, softConstraints } = buildCatalogEntry(capability);

  if (capability.stressContent) {
    const shapes = capability.stressContent({ propsSchema, constraints: softConstraints });
    for (const shape of shapes) {
      if (!STRESS_REGIMES.includes(shape.id)) {
        throw new Error(
          `${capability.meta.id} published stress regime "${shape.id}", which this suite cannot sweep.`,
        );
      }
    }
    return shapes;
  }

  return (['ceiling', 'floor'] as const).map((id) => ({
    id,
    props: fillObject(propsSchema, id, 0, ''),
  }));
};

export type StressCase = {
  label: string;
  capabilityId: string;
  content: StressContentId;
  props: Record<string, unknown>;
  events?: TimedEvent[];
  layout: string;
  composition: Slot;
  profile: StressProfile;
  safeArea: SafeArea;
  frames: number[];
  /** See `SceneCapability.paintsOwnGround`, and `quietBorderReading` in `render/png.ts`. */
  paintsOwnGround: boolean;
};

/**
 * Every published profile. The safe-area suite can use the two profiles that bound camera
 * geometry, but content stress also asks about profile-specific entrances and staggers; a
 * geometric bound cannot stand in for behaviour the profile changes independently.
 */
export const STRESS_PROFILES: readonly MotionProfileId[] = motionProfileIds;

export type StressProfile = MotionProfileId;

/**
 * Two frames, because neither camera is at its extreme for the whole shot and they do not
 * agree on when. A quarter in the entrances have landed and the pan is still left of
 * centre; at the last frame the pan is at its rightmost and the push-in at its tightest.
 */
const framesFor = (duration: number): number[] => [Math.round(duration * 0.25), duration - 1];

/**
 * Every content case × every layout × every declared composition × every motion profile.
 *
 * A layout is how the scene arranges itself and a composition is how much frame it gets,
 * and `layouts.ts`'s claim that *"all three arrangements keep their identity in half a
 * frame"* is checkable no other way. It is also exactly the claim that went unverified for
 * `bar_chart`'s `left` for the entire life of the codebase.
 *
 * The cost self-scales with the cut: the cases are generated from whatever schemas,
 * layouts and compositions survive scope, so cutting shrinks the suite instead of leaving
 * an obligation behind it.
 */
export const stressCases = (): StressCase[] =>
  registry.flatMap((capability) =>
    stressContent(capability).flatMap((content) =>
      Object.keys(capability.layouts).flatMap((layout) =>
        capability.meta.supportedCompositions.flatMap((composition) =>
          STRESS_PROFILES.map((profile) => ({
            label: `${capability.meta.id} at its ${content.id}, ${layout}, composed into ${composition} under ${profile}`,
            capabilityId: capability.meta.id,
            content: content.id,
            props: content.props,
            ...(content.events ? { events: content.events } : {}),
            layout,
            composition,
            profile,
            safeArea: slotRect(composition),
            frames: framesFor(capability.meta.recommendedDurationFrames),
            paintsOwnGround: capability.paintsOwnGround === true,
          })),
        ),
      ),
    ),
  );
