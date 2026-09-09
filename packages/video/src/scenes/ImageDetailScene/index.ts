import type { SceneCapability, SceneProps } from '../../core/types';
import { ImageDetailScene } from './Component';
import { imageDetailActions } from './actions';
import { imageDetailChecks } from './checks';
import { imageDetailConstraints } from './constraints';
import { imageDetailExamples } from './examples';
import { imageDetailLayouts } from './layouts';
import { imageDetailMeta } from './meta';
import { imageDetailSchema } from './schema';
export const imageDetailCapability: SceneCapability = {
  meta: imageDetailMeta,
  schema: imageDetailSchema,
  actions: imageDetailActions,
  checks: imageDetailChecks,
  constraints: imageDetailConstraints,
  examples: imageDetailExamples,
  layouts: imageDetailLayouts,
  hasBleedMedia: true,
  component: ImageDetailScene as unknown as React.ComponentType<SceneProps<never>>,
};
export { ImageDetailScene } from './Component';
export { imageDetailSchema } from './schema';
