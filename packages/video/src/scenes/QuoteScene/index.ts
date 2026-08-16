import type { SceneCapability, SceneProps } from '../../core/types';
import { QuoteScene } from './Component';
import { quoteActions } from './actions';
import { quoteConstraints } from './constraints';
import { quoteExamples } from './examples';
import { quoteLayouts } from './layouts';
import { quoteMeta } from './meta';
import { quoteSchema } from './schema';

/**
 * The assembly point. Nothing else in the repository imports the files beside this one,
 * so this is the whole surface the capability has.
 *
 * No `checks`: this scene has nothing referential to check. The only gated element is the
 * quote unit, and nothing in the vocabulary references it — there is no payload, no
 * second element mounted inside its gate. A held-back quote rendering an eyebrow alone is
 * a legitimate editorial hold, not a false promise, so a check here would only teach the
 * agent a rule that is not true.
 */
export const quoteCapability: SceneCapability = {
  meta: quoteMeta,
  schema: quoteSchema,
  constraints: quoteConstraints,
  actions: quoteActions,
  layouts: quoteLayouts,
  examples: quoteExamples,
  component: QuoteScene as unknown as React.ComponentType<SceneProps<never>>,
};

export { QuoteScene } from './Component';
export { quoteSchema, type QuoteSceneProps } from './schema';
export { quoteMeta } from './meta';
export { quoteActions } from './actions';
export { quoteLayouts } from './layouts';
export { quoteConstraints } from './constraints';
export { quoteExamples } from './examples';
