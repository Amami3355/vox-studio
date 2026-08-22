/**
 * The content-stress shapes the generic filler cannot size.
 *
 * `tests/stress/cases.ts` fills one field at a time from the published JSON Schema, and its
 * filler names the two legal answers when it meets a field it cannot size: *"Either bound
 * it in the schema, or give the capability a control for it."* This capability is the third
 * case that message did not anticipate, and it is the same one `line_chart` is — its
 * statements are **between** fields:
 *
 * - `events[].date` must parse as a UTC calendar date, be distinct, and strictly ascend,
 *   which a `maxLength`-shaped string cannot be;
 * - a period's `from` and `to` are dates that must be in order relative to each other;
 * - `periods` is only legal at all when `events` is non-empty.
 *
 * **Nothing here is a fixture.** Every count and every length is *read* from the projection
 * handed in — `maxItems`, `maxLength`, and the `recommendedMax` this capability publishes
 * in `constraints.ts`. There is no literal below that a reader could also find in
 * `schema.ts` or `constraints.ts`, because the second copy of a number is the copy that
 * goes stale. What this file does choose is *shape* at a given size: where the periods sit
 * inside the chronology, and which moment carries the late annotation.
 */
import type { SoftConstraints, StressShape } from '../../core/types';

type Published = {
  propsSchema: Record<string, unknown>;
  constraints: SoftConstraints;
  actions: { id: string; payloadSchema: Record<string, unknown> | null }[];
};

/** Walk the published schema to a field, so a rename in `schema.ts` fails here loudly. */
const field = (schema: Record<string, unknown>, path: string[]): Record<string, unknown> => {
  let node = schema;
  for (const step of path) {
    const properties = node.properties as Record<string, Record<string, unknown>> | undefined;
    const next = step === '[]' ? (node.items as Record<string, unknown>) : properties?.[step];
    if (!next) throw new Error(`timeline stress: the published schema has no "${path.join('.')}".`);
    node = next;
  }
  return node;
};

const sizeOf = (node: Record<string, unknown>, key: 'maxItems' | 'maxLength'): number => {
  const value = node[key];
  if (typeof value !== 'number') throw new Error(`timeline stress: no published ${key}.`);
  return value;
};

/** Resolve one published action payload, so a rename or payload removal fails loudly. */
const actionPayload = (actions: Published['actions'], id: string): Record<string, unknown> => {
  const payload = actions.find((action) => action.id === id)?.payloadSchema;
  if (!payload) throw new Error(`timeline stress: action "${id}" publishes no payload schema.`);
  return payload;
};

const recommended = (constraints: SoftConstraints, name: string): number => {
  const value = constraints[name]?.recommendedMax;
  if (typeof value !== 'number') {
    throw new Error(`timeline stress: "${name}" publishes no recommendedMax.`);
  }
  return value;
};

/**
 * Prose of an exact length, cycled from one register, because a string at its ceiling made
 * of a single token exercises no wrapping and wrapping is the whole question. Deliberately
 * the same reasoning as `cases.ts`'s own `prose`, which is not imported because `src/` may
 * not reach into `tests/`.
 */
const REGISTER =
  'ruling hearing appeal statute tenant landlord register verdict inquiry session tribunal record';

const prose = (length: number, seed = 0): string => {
  if (length <= 0) return '';
  const words = REGISTER.split(' ');
  let out = '';
  for (let index = 0; out.length < length; index += 1) {
    out = `${out}${out === '' ? '' : ' '}${words[(seed + index) % words.length] as string}`;
  }
  return out.slice(0, length).trimEnd().padEnd(length, 'x');
};

/** One measured worst-case token, with a stable prefix where uniqueness is required. */
const unbreakable = (length: number, prefix = ''): string =>
  `${prefix}${'W'.repeat(Math.max(0, length - prefix.length))}`;

/**
 * `labelLength` makes each label one unbreakable token at the published maximum; otherwise
 * a label is just its position in the chronology, the shortest value that stays unique. The
 * position leads the token so action targets remain unique under the worst measured shape.
 *
 * Dates are one month apart and roll into the next year, so they are distinct, parseable
 * and strictly ascending by construction — the three things the schema demands and no
 * per-field filler can supply.
 */
const datedEvents = (count: number, labelLength?: number): { date: string; label: string }[] =>
  Array.from({ length: count }, (_, index) => {
    const position = `E${index + 1}`;
    return {
      date: `${2000 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`,
      label: labelLength === undefined ? position : unbreakable(labelLength, position),
    };
  });

/**
 * Periods laid over the chronology in equal shares of it, so two of them never collapse
 * into one band and the last always reaches the final event — which is the shape that puts
 * a band's label hard against the right edge of the frame.
 */
const periodsOver = (
  events: { date: string }[],
  count: number,
  labelLength?: number,
): { label: string; from: string; to: string }[] =>
  Array.from({ length: Math.min(count, events.length) }, (_, index) => {
    const share = events.length / count;
    const first = Math.floor(index * share);
    const last = Math.min(events.length - 1, Math.max(first, Math.ceil((index + 1) * share) - 1));
    return {
      label:
        labelLength === undefined
          ? `Period ${index + 1}`
          : unbreakable(labelLength, `P${index + 1}`),
      from: events[first]?.date as string,
      to: events[last]?.date as string,
    };
  });

export const timelineStressContent = ({
  propsSchema,
  constraints,
  actions,
}: Published): StressShape[] => {
  const eventsMax = sizeOf(field(propsSchema, ['events']), 'maxItems');
  const periodsMax = sizeOf(field(propsSchema, ['periods']), 'maxItems');
  const titleMax = sizeOf(field(propsSchema, ['title']), 'maxLength');
  const eventLabelMax = sizeOf(field(propsSchema, ['events', '[]', 'label']), 'maxLength');
  const periodLabelMax = sizeOf(field(propsSchema, ['periods', '[]', 'label']), 'maxLength');
  const annotationTextMax = sizeOf(
    field(actionPayload(actions, 'annotate'), ['text']),
    'maxLength',
  );

  const eventsRecommended = recommended(constraints, 'events');
  const periodsRecommended = recommended(constraints, 'periods');

  /**
   * `+ 1` is the smallest step past a published recommendation, not a number anybody chose:
   * it is the first shape that degrades, and any larger step would be a sample in between.
   */
  const build = (
    id: StressShape['id'],
    eventCount: number,
    periodCount: number,
    atCeiling = false,
  ): StressShape => {
    const events = datedEvents(eventCount, atCeiling ? eventLabelMax : undefined);
    const periods = periodsOver(events, periodCount, atCeiling ? periodLabelMax : undefined);
    const annotated = events.at(-1);

    return {
      id,
      props: {
        title: atCeiling ? prose(titleMax) : `Timeline ${id}`,
        events,
        periods,
      },
      /**
       * Only at the ceiling, and only there because temporal state is what is under stress:
       * an annotation authored late must still attach at the densest shape the schema
       * admits. Everywhere else an event would be a plan's decision about time, which the
       * generated content deliberately does not make.
       */
      ...(atCeiling && annotated
        ? {
            events: [
              {
                frame: 180,
                action: 'annotate',
                payload: {
                  label: annotated.label,
                  text: unbreakable(annotationTextMax),
                },
              },
            ],
          }
        : {}),
    };
  };

  return [
    { id: 'floor', props: { title: '', events: [], periods: [] } },
    build('minimum', 1, 0),
    build('recommended', eventsRecommended, periodsRecommended),
    build('degraded', eventsRecommended + 1, periodsRecommended + 1),
    build('ceiling', eventsMax, periodsMax, true),
  ];
};
