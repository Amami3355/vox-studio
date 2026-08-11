import type { SceneCapability } from '../core/types';
import { barChartCapability } from './BarChartScene';

/**
 * The catalog, in code. Everything downstream — the manifest, the four tools, the
 * Remotion compositions, the studio grid — is derived from this array. Adding a
 * capability means adding one entry here and nothing else.
 */
export const registry: SceneCapability[] = [barChartCapability];

export const capabilityIds = (): string[] => registry.map((c) => c.meta.id);

export const findCapability = (id: string): SceneCapability | undefined =>
  registry.find((c) => c.meta.id === id);

export const requireCapability = (id: string): SceneCapability => {
  const found = findCapability(id);
  if (!found) {
    throw new Error(`Unknown SceneCapability "${id}". Known ids: ${capabilityIds().join(', ')}.`);
  }
  return found;
};
