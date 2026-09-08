import { z } from 'zod';
export const processStepsSchema = z
  .object({
    headline: z
      .string()
      .max(120)
      .default('')
      .describe('Optional process title, not a repeated paragraph.'),
    steps: z
      .array(
        z
          .object({
            label: z.string().min(1).max(100).describe('Name of this stage or state.'),
            detail: z
              .string()
              .max(240)
              .default('')
              .describe('What changes at this stage and why it matters.'),
          })
          .strict(),
      )
      .max(32)
      .describe(
        'Ordered stages. Choose their count from the explanation, not from a template quota. Only active-stage copy is shown; the path retains the sequence. Empty is a deliberate unavailable-process state.',
      ),
  })
  .strict();
export type ProcessStepsProps = z.infer<typeof processStepsSchema>;
