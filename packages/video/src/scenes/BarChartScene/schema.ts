/**
 * HARD constraints only.
 *
 * Anything expressed here is a rejection: the plan does not compile. Everything that
 * should merely degrade lives in `constraints.ts`. Mixing the two makes degradation
 * unreachable — a `.max(8)` would mean the 12-bar aggregation path can never run, and
 * a `.min(2)` would mean the empty state can never be tested.
 *
 * `layout` and `motionProfile` are deliberately NOT in this schema: they belong to the
 * SceneInstance, alongside `props`, exactly as the compiled document represents them.
 * See docs/proposals/architecture-evolutions.md.
 */
import { z } from 'zod';

export const barChartSchema = z.object({
  title: z
    .string()
    .max(120)
    .describe(
      'Headline shown above the chart. Best under 40 characters; beyond that the type ' +
        'scale drops a step automatically.',
    ),

  data: z
    .array(
      z.object({
        label: z.string().max(40).describe('Category name shown under the bar.'),
        value: z.number().describe('Plotted value. Negative values recompute the axis.'),
      }),
    )
    .max(20)
    .describe(
      'Series to compare. Best between 2 and 8 entries. From 9 to 20 the weakest are ' +
        "collapsed into a single 'Others' bar. An empty array renders a typographic " +
        'empty state rather than a blank frame.',
    ),

  unit: z
    .string()
    .max(8)
    .default('')
    .describe("Suffix appended to every value, e.g. '%' or '€'. Empty for bare numbers."),

  valueKind: z
    .enum(['amount', 'share'])
    .default('amount')
    .describe(
      'What the numbers are, which decides what happens to the ones that do not fit. ' +
        "'amount' is a count, a sum of money, a quantity: values beyond the capacity " +
        "collapse into a single 'Others' bar carrying their total. 'share' is a " +
        'percentage or a proportion, where each value is a share of its own whole — ' +
        'adding them would invent a category, so they are dropped instead and the chart ' +
        'shows fewer bars. Set this whenever `unit` is a percentage.',
    ),

  gridlines: z
    .boolean()
    .default(true)
    .describe(
      'Draw the value axis behind the bars. On, the axis states every value and only the ' +
        'highlighted bar prints its own number. Off, the axis disappears and every bar ' +
        'prints its number instead — choose that when the shot is short, when the chart ' +
        'shares the row with a callout, or when the exact figures are the point. Ignored ' +
        'by the horizontal layout, which is a ranking and never draws an axis.',
    ),

  highlight: z
    .string()
    .optional()
    .describe(
      'The `label` of the bar to bring forward. Every other bar recedes toward the ' +
        'background. Must match a label present in `data`.',
    ),

  emphasis: z
    .enum(['neutral', 'positive', 'negative'])
    .default('neutral')
    .describe(
      'Semantic reading of the highlighted value. Selects the accent role from the ' +
        'theme; never a raw colour.',
    ),
});

export type BarChartProps = z.infer<typeof barChartSchema>;
