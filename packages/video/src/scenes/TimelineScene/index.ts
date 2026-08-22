/**
 * The whole surface `timeline` has.
 *
 * Eleven files, the same count `LineChartScene/` carries and for the same two reasons: the
 * action vocabulary references the gated element, so `checks.ts` states rules that are
 * true; and the shape of a valid instance is cross-field — dates that parse, ascend and
 * stay distinct, and a period whose bounds are dates — so no per-field filler can build a
 * worst case and `stress.ts` earns its place.
 *
 * `spine` is the only layout, on purpose. `docs/adding-a-capability.md` says to start with
 * one and prove it end to end; `ledger` and `lanes` are staged behind it, and `lanes` last
 * because it is the only one that reads a field the others refuse.
 */
import type { SceneCapability, SceneProps } from '../../core/types';
import { TimelineScene } from './Component';
import { timelineActions } from './actions';
import { timelineChecks } from './checks';
import { timelineConstraints } from './constraints';
import { timelineExamples } from './examples';
import { timelineLayouts } from './layouts';
import { timelineMeta } from './meta';
import { timelineSchema } from './schema';
import { timelineStressContent } from './stress';

export const timelineCapability: SceneCapability = {
  meta: timelineMeta,
  schema: timelineSchema,
  constraints: timelineConstraints,
  actions: timelineActions,
  layouts: timelineLayouts,
  examples: timelineExamples,
  component: TimelineScene as unknown as React.ComponentType<SceneProps<never>>,
  checks: timelineChecks,
  stressContent: timelineStressContent,
};

export { TimelineScene } from './Component';
export { timelineSchema, type TimelineProps } from './schema';
export { timelineMeta } from './meta';
export { timelineActions, TIMELINE_ANNOTATION_TEXT_MAX } from './actions';
export {
  timelineLayouts,
  timelineLayoutIds,
  timelineCapacity,
  timelineGeometry,
  type TimelineLayoutId,
} from './layouts';
export { timelineConstraints } from './constraints';
export { timelineExamples } from './examples';
