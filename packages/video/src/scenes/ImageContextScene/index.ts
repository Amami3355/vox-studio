import type { SceneCapability, SceneProps } from '../../core/types';
import { ImageContextScene } from './Component';
import { imageContextActions } from './actions';
import { imageContextChecks } from './checks';
import { imageContextConstraints } from './constraints';
import { imageContextExamples } from './examples';
import { imageContextLayouts } from './layouts';
import { imageContextMeta } from './meta';
import { imageContextSchema } from './schema';

export const imageContextCapability: SceneCapability = {
  meta: imageContextMeta,
  schema: imageContextSchema,
  constraints: imageContextConstraints,
  actions: imageContextActions,
  layouts: imageContextLayouts,
  examples: imageContextExamples,
  component: ImageContextScene as unknown as React.ComponentType<SceneProps<never>>,
  checks: imageContextChecks,
};

export { ImageContextScene } from './Component';
export { imageContextSchema, type ImageContextProps } from './schema';
export { imageContextMeta } from './meta';
export { imageContextActions } from './actions';
export { imageContextLayouts } from './layouts';
export { imageContextConstraints } from './constraints';
export { imageContextExamples } from './examples';
