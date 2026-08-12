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
import type {
  AssetRef,
  PersistentElement,
  ResolvedSceneAssets,
  SafeArea,
  TimedEvent,
} from '../core/types';
import type { MotionProfileId } from '../design/motion';

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
  /**
   * Still the authored props, unparsed. The renderer parses them through the capability
   * schema, which is the one source of truth for defaults — a second parse here would
   * bake today's defaults into a document that outlives them.
   */
  props: Record<string, unknown>;
  /** Resolved, never optional. A runtime that picks a layout is a runtime deciding. */
  layout: string;
  motionProfile: MotionProfileId;
  /**
   * The resolver's output, on its own channel. It never travels inside `props`, so an
   * `AssetRef` stays unreachable from anything an agent authors against.
   */
  assets: ResolvedSceneAssets;
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

/**
 * What a persistent element *is*, held once per section rather than repeated on every
 * state — `layoutStates` says where it is, this says what it looks like. An element with
 * no asset draws nothing; the runtime is not the place to invent a stand-in.
 */
export type CompiledPersistentElement = {
  id: string;
  element: PersistentElement['element'];
  asset?: AssetRef;
};

export type CompiledSection = {
  id: string;
  from: number;
  to: number;
  scenes: CompiledScene[];
  persistent: CompiledPersistentElement[];
  layoutStates: LayoutState[];
};

/**
 * §10's `audio` block. Names of files in Remotion's `public/`, resolved by the runtime
 * through `staticFile` — the frozen document writes them `asset://vo.mp3` for the same
 * reason: the document says *which* audio, never where the bytes live on this machine.
 *
 * The voice-over is a **recording**, not something a build step can reproduce. Two
 * identical synthesis requests return different audio and different boundaries, so the mp3
 * named here and the `TimedBeat[]` the document was compiled from are one artifact. Swap
 * either alone and every scene is cut against words the audio does not say, at no point
 * failing anything.
 */
export type CompiledAudio = { voiceover?: string; music?: string };

export type CompiledDocument = {
  fps: number;
  durationInFrames: number;
  beats: FrameBeat[];
  sections: CompiledSection[];
  audio: CompiledAudio;
};
