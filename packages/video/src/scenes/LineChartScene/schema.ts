import { z } from 'zod';
import { parseUtcDate } from '../../core/time-axis';

const pointSchema = z
  .object({
    date: z
      .string()
      .max(10)
      .refine((value) => parseUtcDate(value) !== null, {
        message: 'Expected a real calendar date in strict YYYY-MM-DD form.',
      })
      .describe('Observation date in strict YYYY-MM-DD form, interpreted at UTC midnight.'),
    label: z
      .string()
      .min(1)
      .max(24)
      .describe('Concise authored date label shown on the x-axis and named by point actions.'),
  })
  .strict();

const seriesSchema = z
  .object({
    label: z
      .string()
      .min(1)
      .max(32)
      .describe('Unique series name used by the legend, focus and annotation actions.'),
    values: z
      .array(z.number().finite().describe('Finite value observed at the aligned point index.'))
      .max(36)
      .describe('Values aligned one-for-one with `points` in authored order.'),
  })
  .strict();

const focusSchema = z
  .object({
    series: z.string().min(1).max(32).describe('Must match one `series.label`.'),
    label: z
      .string()
      .min(1)
      .max(24)
      .optional()
      .describe('Optional point display label to focus within the named series.'),
  })
  .strict();

export const lineChartSchema = z
  .object({
    title: z
      .string()
      .max(120)
      .describe('Headline above the trend. Best under 48 characters; longer copy steps down.'),
    points: z
      .array(pointSchema)
      .max(36)
      .describe(
        'Shared ordered time axis. Best between 3 and 16 observations; up to 36 remain fully plotted with sparse labels and markers.',
      ),
    series: z
      .array(seriesSchema)
      .max(3)
      .describe('One or two aligned temporal series are recommended; three remain renderable.'),
    unit: z
      .string()
      .max(8)
      .default('')
      .describe(
        "Suffix applied consistently to axis, focus and annotation values, e.g. '%' or '°C'.",
      ),
    baseline: z
      .enum(['zero', 'extent'])
      .default('zero')
      .describe(
        '`zero` includes zero to avoid exaggerating ordinary change. `extent` uses observed bounds with headroom for narrow measures such as temperature or rates.',
      ),
    focus: focusSchema
      .optional()
      .describe('Initial semantic focus. A point focus always belongs to a named series.'),
  })
  .strict()
  .superRefine((props, context) => {
    const emptyPoints = props.points.length === 0;
    const emptySeries = props.series.length === 0;
    if (emptyPoints !== emptySeries) {
      context.addIssue({
        code: 'custom',
        path: emptyPoints ? ['series'] : ['points'],
        message: 'The only empty shape is `points: []` with `series: []`; provide both or neither.',
      });
    }

    uniqueIssues(
      props.points.map((point) => point.date),
      'date',
      ['points'],
      'date',
      context,
    );
    uniqueIssues(
      props.points.map((point) => point.label),
      'point label',
      ['points'],
      'label',
      context,
    );
    uniqueIssues(
      props.series.map((entry) => entry.label),
      'series label',
      ['series'],
      'label',
      context,
    );

    const times = props.points.map((point) => parseUtcDate(point.date));
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
          path: ['points', index, 'date'],
          message: `Date must be later than points[${index - 1}].date; authored order is binding and is never sorted.`,
        });
      }
    }

    for (const [index, entry] of props.series.entries()) {
      if (entry.values.length !== props.points.length) {
        context.addIssue({
          code: 'custom',
          path: ['series', index, 'values'],
          message: `Series "${entry.label}" has ${entry.values.length} values; expected exactly ${props.points.length}, one for each point.`,
        });
      }
    }

    if (props.focus) {
      const knownSeries = props.series.map((entry) => entry.label);
      const knownPoints = props.points.map((point) => point.label);
      if (!knownSeries.includes(props.focus.series)) {
        context.addIssue({
          code: 'custom',
          path: ['focus', 'series'],
          message: `Focus series "${props.focus.series}" is unknown; expected one of: ${knownSeries.join(', ')}.`,
        });
      }
      if (props.focus.label !== undefined && !knownPoints.includes(props.focus.label)) {
        context.addIssue({
          code: 'custom',
          path: ['focus', 'label'],
          message: `Focus point "${props.focus.label}" is unknown; expected one of: ${knownPoints.join(', ')}.`,
        });
      }
    }
  });

const uniqueIssues = (
  values: string[],
  subject: string,
  path: (string | number)[],
  field: 'date' | 'label',
  context: z.RefinementCtx,
): void => {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (seen.has(value)) {
      context.addIssue({
        code: 'custom',
        path: [...path, index, field],
        message: `Duplicate ${subject} "${value}"; action targets must identify exactly one item.`,
      });
    }
    seen.add(value);
  }
};

export type LineChartProps = z.infer<typeof lineChartSchema>;
