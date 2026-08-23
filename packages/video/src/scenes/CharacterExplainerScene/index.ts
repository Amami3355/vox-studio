/**
 * The assembly point. Nothing else in the repository imports the files beside this one,
 * so this is the whole surface a capability has.
 *
 * Registered with one line in `../registry.ts` and one `pnpm catalog`; the manifest, the
 * plan contract, the production contracts, the Remotion compositions and the component
 * studio are all derived from that array.
 */
import type { SceneCapability, SceneProps } from '../../core/types';
import { CharacterExplainerScene } from './Component';
import { characterExplainerActions } from './actions';
import { characterExplainerChecks } from './checks';
import { characterExplainerConstraints } from './constraints';
import { characterExplainerExamples } from './examples';
import { characterExplainerLayouts } from './layouts';
import { characterExplainerMeta } from './meta';
import { characterExplainerSchema } from './schema';

export const characterExplainerCapability: SceneCapability = {
  meta: characterExplainerMeta,
  schema: characterExplainerSchema,
  constraints: characterExplainerConstraints,
  actions: characterExplainerActions,
  layouts: characterExplainerLayouts,
  examples: characterExplainerExamples,
  component: CharacterExplainerScene as unknown as React.ComponentType<SceneProps<never>>,
  checks: characterExplainerChecks,
};

export { CharacterExplainerScene } from './Component';
export { characterExplainerSchema, type CharacterExplainerProps } from './schema';
export { characterExplainerMeta } from './meta';
export { characterExplainerActions } from './actions';
export { characterExplainerLayouts } from './layouts';
export { characterExplainerConstraints } from './constraints';
export { characterExplainerExamples } from './examples';
