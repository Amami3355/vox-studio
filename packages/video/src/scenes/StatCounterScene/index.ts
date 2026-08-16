import type { SceneCapability, SceneProps } from '../../core/types';
import { StatCounterScene } from './Component';
import { statCounterActions } from './actions';
import { statCounterConstraints } from './constraints';
import { statCounterExamples } from './examples';
import { statCounterLayouts } from './layouts';
import { statCounterMeta } from './meta';
import { statCounterSchema } from './schema';

/**
 * The assembly point. Nothing else in the repository imports the files beside this one,
 * so this is the whole surface the capability has.
 *
 * No `checks`: this scene has nothing referential to check. The only gated element is the
 * stat, and nothing in the vocabulary references it — there is no payload, no second
 * element mounted inside its gate. A held-back stat rendering a label alone is a
 * legitimate editorial hold, not a false promise, so a check here would only teach the
 * agent a rule that is not true. Same shape as `quote`, whose `checks.ts` is deleted for
 * the same reason.
 */
export const statCounterCapability: SceneCapability = {
  meta: statCounterMeta,
  schema: statCounterSchema,
  constraints: statCounterConstraints,
  actions: statCounterActions,
  layouts: statCounterLayouts,
  examples: statCounterExamples,
  component: StatCounterScene as unknown as React.ComponentType<SceneProps<never>>,
};

export { StatCounterScene } from './Component';
export { statCounterSchema, type StatCounterSceneProps } from './schema';
export { statCounterMeta } from './meta';
export { statCounterActions } from './actions';
export { statCounterLayouts } from './layouts';
export { statCounterConstraints } from './constraints';
export { statCounterExamples } from './examples';
