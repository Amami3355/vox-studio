/**
 * The compiled document — the seam between the compiler and Remotion.
 *
 * Everything symbolic dies here. Upstream there are anchors, slots, beat ids and
 * milliseconds; downstream there are only frames and percentages. Nothing in this file
 * may reference a `Slot`, an anchor string or a millisecond.
 *
 * It is **JSON**: no functions, no class instances, no React elements, no Zod schemas. It
 * can be written to disk, handed to `@remotion/player`, and compared with `toEqual` in a
 * test that takes a millisecond. That is what keeps assertions about composition out of
 * the render suite.
 */
import type { FrameBeat } from '../core/anchors';
import type { Rect } from '../core/slots';
import type { SafeArea, TimedEvent } from '../core/types';

/**
 * Where one persistent element sits, over one run of frames.
 *
 * There is no entry for a hidden element: **absence is hiddenness**. The report says why,
 * which is where a reason belongs — a document that carried `visible: false` would invite
 * the runtime to have an opinion about it.
 */
export type LayoutState = {
  elementId: string;
  from: number;
  to: number;
  rect: Rect;
};

export type CompiledScene = {
  id: string;
  capabilityId: string;
  /** Absolute frame, inclusive. */
  from: number;
  /** Absolute frame, exclusive. */
  to: number;
  /**
   * Frames **relative to this scene's start**, unlike `from`/`to`, because Remotion's
   * `<Sequence>` reparents the frame clock for its children. The asymmetry is deliberate
   * and is the one place in the document where it appears.
   */
  events: TimedEvent[];
  /** The rectangle this scene renders into — the resolution of ADR-0003, in percentages. */
  safeArea: SafeArea;
};

export type CompiledSection = {
  id: string;
  from: number;
  to: number;
  scenes: CompiledScene[];
  layoutStates: LayoutState[];
};

export type CompiledDocument = {
  fps: number;
  durationInFrames: number;
  beats: FrameBeat[];
  sections: CompiledSection[];
};
