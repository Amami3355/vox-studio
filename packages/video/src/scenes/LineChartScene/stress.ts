/**
 * The content-stress shapes the generic filler cannot size.
 *
 * `tests/stress/cases.ts` fills one field at a time from the published JSON Schema, and its
 * filler says what to do when it meets a field it cannot size: *"Either bound it in the
 * schema, or give the capability a control for it."* This capability is the case that
 * message did not anticipate — two of its statements are **between** fields, and no
 * per-field filler can honour either:
 *
 * - `series[].values` is aligned one-for-one with `points` (`schema.ts`'s refinement), so
 *   sizing the two arrays independently produces an instance the schema rejects;
 * - `point.date` must parse as a UTC date and every date must be distinct, which a
 *   `maxLength`-shaped string cannot be.
 *
 * **Nothing here is a fixture, and that distinction is the whole point of the file.** The
 * header of `cases.ts` argues that a hand-written case states the capability's numbers a
 * second time and the second copy is the one that goes stale — raise a ceiling in
 * `schema.ts` and the suite quietly keeps stressing the old one. That argument does not
 * weaken by moving the restatement into the capability's own folder, so every count and
 * every length below is *read* from the projection handed in: `maxItems`, `maxLength`, and
 * the `recommendedMax` this capability publishes in `constraints.ts`. There is no literal
 * in this file that a reader could find in `schema.ts` or `constraints.ts` as well.
 *
 * What it does choose is *shape* rather than *size* — a constant series, a mixed-sign
 * series, the widest figure first. Those are choices between frames that are each the right
 * size, which is exactly what `cases.ts` says a generator must not make and a capability
 * must. They are here for the reason `docs/adding-a-capability.md` gives controls: the spec
 * asks the stress suite to draw "large and negative values, constant values, mixed signs",
 * and none of those is a size anything publishes.
 */
import type { SoftConstraints, StressShape } from '../../core/types';

type Published = { propsSchema: Record<string, unknown>; constraints: SoftConstraints };

/** Walk the published schema to a field, so a rename in `schema.ts` fails here loudly. */
const field = (schema: Record<string, unknown>, path: string[]): Record<string, unknown> => {
  let node = schema;
  for (const step of path) {
    const properties = node.properties as Record<string, Record<string, unknown>> | undefined;
    const next = step === '[]' ? (node.items as Record<string, unknown>) : properties?.[step];
    if (!next)
      throw new Error(`line_chart stress: the published schema has no "${path.join('.')}".`);
    node = next;
  }
  return node;
};

const sizeOf = (node: Record<string, unknown>, key: 'maxItems' | 'maxLength'): number => {
  const value = node[key];
  if (typeof value !== 'number') throw new Error(`line_chart stress: no published ${key}.`);
  return value;
};

const recommended = (constraints: SoftConstraints, name: string): number => {
  const value = constraints[name]?.recommendedMax;
  if (typeof value !== 'number') {
    throw new Error(`line_chart stress: "${name}" publishes no recommendedMax.`);
  }
  return value;
};

/**
 * Prose of an exact length, cycled from one register, because a string at its ceiling made
 * of a single token exercises no wrapping and wrapping is the whole question. Deliberately
 * the same reasoning — and the same register — as `cases.ts`'s own `prose`, which is not
 * imported because `src/` may not reach into `tests/`.
 */
const REGISTER =
  'rent income households tenure arrears deposit landlord register survey quarter region cohort';

const prose = (length: number, seed = 0): string => {
  if (length <= 0) return '';
  const words = REGISTER.split(' ');
  let out = '';
  for (let i = 0; out.length < length; i++) {
    out = `${out}${out === '' ? '' : ' '}${words[(seed + i) % words.length] as string}`;
  }
  return out.slice(0, length).trimEnd().padEnd(length, 'x');
};

/**
 * `atCeiling` pads each label out to the published maximum; otherwise a label is just its
 * point's position, which is the shortest thing that can still be unique.
 *
 * The position leads rather than trails. `checks.ts` rejects duplicate point labels because
 * an action targeting one has to identify exactly one, and a label built as prose-then-index
 * loses the index to the truncation that holds it under the ceiling — every long label then
 * collides on the same prefix. Uniqueness has to survive the cut, so it goes in front of it.
 */
const datedPoints = (count: number, labelLength?: number): { date: string; label: string }[] =>
  Array.from({ length: count }, (_, index) => {
    const position = `P${index + 1}`;
    const filler =
      labelLength === undefined ? '' : prose(Math.max(0, labelLength - position.length - 1), index);
    return {
      // Distinct and parseable by construction: one month apart, rolling into the next year.
      date: `${2023 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`,
      label: filler === '' ? position : `${position} ${filler}`,
    };
  });

/**
 * The widest figure an axis can be asked to letter.
 *
 * A **choice**, and the one number in this file that is not read from the projection —
 * because `values` is `z.number()` with no published bound, so there is nothing to read.
 * Seven digits and a sign is the widest label the value formatter produces before it
 * switches to a compact form, which makes it the worst case for the axis gutter.
 */
const WIDEST_FIGURE = -9_999_999;

/**
 * One series per shape the spec names, aligned to `points` by construction.
 *
 * Index 0 opens on the widest figure and then climbs through zero; index 1 is constant,
 * which is the case that makes a naive extent collapse to a zero span; index 2 alternates
 * sign, which is the case that decides where the axis puts its zero.
 */
const alignedSeries = (
  pointCount: number,
  seriesCount: number,
  labelLength?: number,
): { label: string; values: number[] }[] =>
  Array.from({ length: seriesCount }, (_, seriesIndex) => ({
    label:
      labelLength === undefined
        ? `Series ${seriesIndex + 1}`
        : `S${seriesIndex + 1} ${prose(Math.max(0, labelLength - `S${seriesIndex + 1} `.length), seriesIndex)}`,
    values: Array.from({ length: pointCount }, (_, pointIndex) => {
      if (seriesIndex === 0) {
        return pointIndex === 0 ? WIDEST_FIGURE : pointIndex * 310_000 - 4_000_000;
      }
      if (seriesIndex === 1) return 2_500_000;
      return (pointIndex % 2 === 0 ? -1 : 1) * (800_000 + pointIndex * 120_000);
    }),
  }));

export const lineChartStressContent = ({ propsSchema, constraints }: Published): StressShape[] => {
  const pointsMax = sizeOf(field(propsSchema, ['points']), 'maxItems');
  const seriesMax = sizeOf(field(propsSchema, ['series']), 'maxItems');
  const titleMax = sizeOf(field(propsSchema, ['title']), 'maxLength');
  const unitMax = sizeOf(field(propsSchema, ['unit']), 'maxLength');
  const pointLabelMax = sizeOf(field(propsSchema, ['points', '[]', 'label']), 'maxLength');
  const seriesLabelMax = sizeOf(field(propsSchema, ['series', '[]', 'label']), 'maxLength');

  const pointsRecommended = recommended(constraints, 'points');
  const seriesRecommended = recommended(constraints, 'series');

  /**
   * `+ 1` is the smallest step past a published recommendation, not a number anybody chose:
   * it is the first shape that degrades, and any larger step would be a sample in between.
   */
  const build = (
    id: StressShape['id'],
    pointCount: number,
    seriesCount: number,
    atCeiling = false,
  ): StressShape => {
    const points = datedPoints(pointCount, atCeiling ? pointLabelMax : undefined);
    const series = alignedSeries(pointCount, seriesCount, atCeiling ? seriesLabelMax : undefined);
    const focused = series[0];
    const last = points.at(-1);
    const annotated = series.at(-1);
    const midpoint = points[Math.floor(points.length / 2)];

    return {
      id,
      props: {
        title: atCeiling ? prose(titleMax) : `Line chart ${id}`,
        points,
        series,
        unit: atCeiling ? prose(unitMax) : 'k',
        ...(atCeiling && focused && last
          ? { focus: { series: focused.label, label: last.label } }
          : {}),
      },
      /**
       * Only at the ceiling, and only there because temporal state is what is under stress:
       * an annotation authored late must still be attached at the densest shape the schema
       * admits. Everywhere else an event would be a plan's decision about time, which the
       * generated content deliberately does not make.
       */
      ...(atCeiling && annotated && midpoint
        ? {
            events: [
              {
                frame: 180,
                action: 'annotatePoint',
                payload: {
                  series: annotated.label,
                  label: midpoint.label,
                  text: 'A late annotation remains attached at the hard density ceiling',
                },
              },
            ],
          }
        : {}),
    };
  };

  return [
    { id: 'floor', props: { title: '', points: [], series: [], unit: '' } },
    build('minimum', 1, 1),
    build('recommended', pointsRecommended, seriesRecommended),
    build('degraded', pointsRecommended + 1, seriesRecommended + 1),
    build('ceiling', pointsMax, seriesMax, true),
  ];
};
