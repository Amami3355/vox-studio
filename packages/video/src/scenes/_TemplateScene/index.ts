/**
 * TEMPLATE — copy this folder, do not register this scene.
 *
 * The assembly point. Nothing else in the repository imports the files beside this one, so
 * this is the whole surface a capability has.
 *
 * To make a copy of this folder real, add one line to `../registry.ts`:
 *
 *     export const registry: SceneCapability[] = [..., myNewCapability];
 *
 * and then run `pnpm catalog`. The manifest, the plan contract, the production contracts,
 * the Remotion compositions and the component studio are all derived from that array.
 * There is no second place to register anything.
 *
 * `checks` is the only optional member of `SceneCapability`. Drop it, and `state.ts` with
 * it, if the scene has no actions.
 *
 * The `as unknown as` on `component` is the house form: `SceneCapability` erases the props
 * type so the registry can hold capabilities with different prop shapes in one array.
 */
import type { SceneCapability, SceneProps } from '../../core/types';
import { TemplateScene } from './Component';
import { templateSceneActions } from './actions';
import { templateSceneChecks } from './checks';
import { templateSceneConstraints } from './constraints';
import { templateSceneExamples } from './examples';
import { templateSceneLayouts } from './layouts';
import { templateSceneMeta } from './meta';
import { templateSceneSchema } from './schema';

export const templateSceneCapability: SceneCapability = {
  meta: templateSceneMeta,
  schema: templateSceneSchema,
  constraints: templateSceneConstraints,
  actions: templateSceneActions,
  layouts: templateSceneLayouts,
  examples: templateSceneExamples,
  component: TemplateScene as unknown as React.ComponentType<SceneProps<never>>,
  checks: templateSceneChecks,
};

export { TemplateScene } from './Component';
export { templateSceneSchema, type TemplateSceneProps } from './schema';
export { templateSceneMeta } from './meta';
export { templateSceneActions } from './actions';
export { templateSceneLayouts } from './layouts';
export { templateSceneConstraints } from './constraints';
export { templateSceneExamples } from './examples';
