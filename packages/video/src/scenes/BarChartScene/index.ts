import type { SceneCapability, SceneProps } from '../../core/types';
import { BarChartScene } from './Component';
import { barChartActions } from './actions';
import { barChartChecks } from './checks';
import { barChartConstraints } from './constraints';
import { barChartExamples } from './examples';
import { barChartLayouts } from './layouts';
import { barChartMeta } from './meta';
import { barChartSchema } from './schema';

export const barChartCapability: SceneCapability = {
  meta: barChartMeta,
  schema: barChartSchema,
  constraints: barChartConstraints,
  actions: barChartActions,
  layouts: barChartLayouts,
  examples: barChartExamples,
  component: BarChartScene as unknown as React.ComponentType<SceneProps<never>>,
  checks: barChartChecks,
};

export { BarChartScene } from './Component';
export { barChartSchema, type BarChartProps } from './schema';
export { barChartMeta } from './meta';
export { barChartActions } from './actions';
export { barChartLayouts, type BarChartLayoutId } from './layouts';
export { barChartConstraints } from './constraints';
export { barChartExamples } from './examples';
