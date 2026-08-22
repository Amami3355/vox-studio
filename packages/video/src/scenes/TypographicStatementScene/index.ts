import type { SceneCapability, SceneProps } from '../../core/types';
import { TypographicStatementScene } from './Component';
import { typographicStatementActions } from './actions';
import { typographicStatementChecks } from './checks';
import { typographicStatementConstraints } from './constraints';
import { typographicStatementExamples } from './examples';
import { typographicStatementLayouts } from './layouts';
import { typographicStatementMeta } from './meta';
import { typographicStatementSchema } from './schema';

/**
 * The assembly point. Nothing else in the repository imports the files beside this one,
 * so this is the whole surface the capability has.
 *
 * It carries `checks`, where `QuoteScene` — the other capability in this family — drops
 * them. The difference is the second verb: `quote` has one reveal and nothing in its
 * vocabulary references the gated element, so a check there would state a rule that is not
 * true. `advanceWord` steps through the words the statement contains, and a `word:` anchor
 * must name the same positional token the component will light. Neither count nor
 * correspondence is expressible in the generic validator.
 *
 * No `stress.ts`. Every field here is an independent scalar the generic schema-driven
 * filler can size, which is the bar the procedure sets for the exceptional eleventh file.
 */
export const typographicStatementCapability: SceneCapability = {
  meta: typographicStatementMeta,
  schema: typographicStatementSchema,
  constraints: typographicStatementConstraints,
  actions: typographicStatementActions,
  layouts: typographicStatementLayouts,
  examples: typographicStatementExamples,
  checks: typographicStatementChecks,
  paintsOwnGround: true,
  component: TypographicStatementScene as unknown as React.ComponentType<SceneProps<never>>,
};

export { TypographicStatementScene } from './Component';
export { typographicStatementSchema, type TypographicStatementProps } from './schema';
export { typographicStatementMeta } from './meta';
export { typographicStatementActions } from './actions';
export { typographicStatementLayouts } from './layouts';
export { typographicStatementConstraints } from './constraints';
export { typographicStatementExamples } from './examples';
export { typographicStatementChecks } from './checks';
