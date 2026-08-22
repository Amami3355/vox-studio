import type { SceneCapability, SceneProps } from '../../core/types';
import { LineChartScene } from './Component';
import { lineChartActions } from './actions';
import { lineChartChecks } from './checks';
import { lineChartConstraints } from './constraints';
import { lineChartExamples } from './examples';
import { lineChartLayouts } from './layouts';
import { lineChartMeta } from './meta';
import { lineChartSchema } from './schema';
import { lineChartStressContent } from './stress';

export const lineChartCapability: SceneCapability = {
  meta: lineChartMeta,
  schema: lineChartSchema,
  constraints: lineChartConstraints,
  actions: lineChartActions,
  layouts: lineChartLayouts,
  examples: lineChartExamples,
  component: LineChartScene as unknown as React.ComponentType<SceneProps<never>>,
  checks: lineChartChecks,
  stressContent: lineChartStressContent,
};

export { LineChartScene } from './Component';
export { lineChartSchema, type LineChartProps } from './schema';
export { lineChartMeta } from './meta';
export { lineChartActions } from './actions';
export { lineChartLayouts, type LineChartLayoutId } from './layouts';
export { lineChartConstraints } from './constraints';
export { lineChartExamples } from './examples';
