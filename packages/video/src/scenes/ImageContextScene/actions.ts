/**
 * No actions, and the empty object is the statement.
 *
 * An action vocabulary is a promise that the compiler will resolve anchors onto frames
 * and the component will animate on them. Inventing one before a beat has asked for it
 * produces the failure the architecture calls the most dangerous of all — a plan that
 * validates, renders perfectly, and animates nothing. Entrance and camera movement come
 * from the motion profile; this stays empty until a narrative need justifies a verb.
 */
import type { ActionDef } from '../../core/types';

export const imageContextActions = {} as const satisfies Record<string, ActionDef>;
