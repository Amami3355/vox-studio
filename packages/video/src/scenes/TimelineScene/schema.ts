import { z } from 'zod';
import { parseUtcDate } from '../../core/time-axis';

const calendarDate = (subject: string) =>
  z
    .string()
    .max(10)
    .refine((value) => parseUtcDate(value) !== null, {
      message: 'Expected a real calendar date in strict YYYY-MM-DD form.',
    })
    .describe(subject);

const eventSchema = z
  .object({
    date: calendarDate(
      'Date the event happened, in strict YYYY-MM-DD form, interpreted at UTC midnight.',
    ),
    label: z
      .string()
      .min(1)
      .max(48)
      .describe(
        'What happened, set as display type and named by `focusEvent` and `annotate`. Must be unique within the scene.',
      ),
    track: z
      .string()
      .min(1)
      .max(24)
      .optional()
      .describe(
        'Name of the thread this event belongs to. Absent means one thread. Exactly two distinct values are required by the `lanes` layout and refused by the others.',
      ),
  })
  .strict();

const periodSchema = z
  .object({
    label: z
      .string()
      .min(1)
      .max(40)
      .describe('What the marked stretch of time is, e.g. "Rent cap in force".'),
    from: calendarDate('First day of the period, in strict YYYY-MM-DD form.'),
    to: calendarDate('Last day of the period, in strict YYYY-MM-DD form. Never before `from`.'),
  })
  .strict();

/**
 * Props, all authored.
 *
 * **There is no `scale` or `orientation` field.** Whether time is drawn to scale is a
 * property of the layout — `spine` is proportional, `ledger` is ordinal — and a prop that
 * restated it would let an instance ask for a combination no layout draws.
 *
 * **There is no `detail` field on an event.** Durable per-event prose arrives through the
 * `annotate` action, which is where `line_chart` already puts it. A prop would give the
 * same text two homes and no way to time either of them.
 *
 * **A period may begin before the first event or end after the last one.** The axis extent
 * is the union of the event dates and the period bounds, so such a period widens the axis
 * and is drawn in full rather than clipped. That is why no refusal exists for it.
 */
export const timelineSchema = z
  .object({
    title: z
      .string()
      .max(120)
      .describe('Headline above the chronology. Best under 48 characters; longer copy steps down.'),
    events: z
      .array(eventSchema)
      .max(24)
      .describe(
        'The chronology, in strictly ascending date order. Authored order is binding and is never sorted. Best between 3 and 6 events; more remain drawn with their labels stacked.',
      ),
    periods: z
      .array(periodSchema)
      .max(2)
      .default([])
      .describe(
        'Named stretches of time drawn as continuous things rather than as pairs of events. One is the ordinary case; two remain drawable.',
      ),
  })
  .strict()
  .superRefine((props, context) => {
    if (props.events.length === 0 && props.periods.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['periods'],
        message:
          'A period needs a chronology to mark; the only empty shape is `events: []` with `periods: []`.',
      });
    }

    const seen = new Set<string>();
    for (const [index, event] of props.events.entries()) {
      if (seen.has(event.label)) {
        context.addIssue({
          code: 'custom',
          path: ['events', index, 'label'],
          message: `Duplicate event label "${event.label}"; \`focusEvent\` and \`annotate\` name a label and must identify exactly one event.`,
        });
      }
      seen.add(event.label);
    }

    const times = props.events.map((event) => parseUtcDate(event.date));
    for (let index = 1; index < times.length; index += 1) {
      const current = times[index];
      const previous = times[index - 1];
      if (
        current !== undefined &&
        previous !== undefined &&
        current !== null &&
        previous !== null &&
        current <= previous
      ) {
        context.addIssue({
          code: 'custom',
          path: ['events', index, 'date'],
          message: `Date must be later than events[${index - 1}].date; authored order is binding and a chronology is never sorted for you. Two events on one day need one label that carries both.`,
        });
      }
    }

    for (const [index, period] of props.periods.entries()) {
      const from = parseUtcDate(period.from);
      const to = parseUtcDate(period.to);
      if (from !== null && to !== null && to < from) {
        context.addIssue({
          code: 'custom',
          path: ['periods', index, 'to'],
          message: `Period "${period.label}" ends before it starts; \`to\` must be on or after \`from\`.`,
        });
      }
    }
  });

export type TimelineProps = z.infer<typeof timelineSchema>;
