import type { SceneCapability, SceneProps } from '../../core/types';
import { ProcessStepsScene } from './Component';
import { processStepsActions } from './actions';
import { processStepsChecks } from './checks';
import { processStepsConstraints } from './constraints';
import { processStepsExamples } from './examples';
import { processStepsLayouts } from './layouts';
import { processStepsMeta } from './meta';
import { processStepsSchema } from './schema';
export const processStepsCapability: SceneCapability = {
  meta: processStepsMeta,
  schema: processStepsSchema,
  actions: processStepsActions,
  checks: processStepsChecks,
  constraints: processStepsConstraints,
  examples: processStepsExamples,
  layouts: processStepsLayouts,
  component: ProcessStepsScene as unknown as React.ComponentType<SceneProps<never>>,
};
export { ProcessStepsScene } from './Component';
export { processStepsSchema } from './schema';
