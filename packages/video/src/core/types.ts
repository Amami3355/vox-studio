/**
 * Core contracts shared by every layer.
 *
 * The single most important distinction in this file is SceneCapability vs
 * SceneInstance. A capability is what exists in the catalog (8-12 of them, defined by
 * code, immutable at runtime). An instance is what exists in one video (dozens per
 * project, authored by the agent, edited by the user, serialised into the document).
 * No code may blur that boundary.
 */
import type { z } from 'zod';
import type { MotionProfileId, Pace } from '../design/motion';
import type { AssetRef, AssetRequirement, ResolvedSceneAssets } from './assets';

export type { AssetRef, AssetRequirement, ResolvedSceneAssets } from './assets';

/* ------------------------------------------------------------------ layout */

export type Slot =
  | 'full'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'center'
  | 'cornerTL'
  | 'cornerTR'
  | 'cornerBL'
  | 'cornerBR';

export const ALL_SLOTS: Slot[] = [
  'full',
  'left',
  'right',
  'top',
  'bottom',
  'center',
  'cornerTL',
  'cornerTR',
  'cornerBL',
  'cornerBR',
];

/** Percentages of the canvas that a scene must keep clear. Computed, never authored. */
export type SafeArea = { top: number; right: number; bottom: number; left: number };

export const NO_SAFE_AREA: SafeArea = { top: 0, right: 0, bottom: 0, left: 0 };

/* ------------------------------------------------------------------- beats */

/**
 * The narrative unit. A beat carries its voice-over text verbatim, which is why no
 * separate script artifact exists: the spoken script is the ordered concatenation of
 * beat texts, and two artifacts holding the same words would drift with nothing able to
 * detect it. See ADR-0002.
 */
export type Beat = { id: string; text: string };

/**
 * A beat plus its real bounds, as spoken. Produced by `packages/voice` from the TTS
 * timepoints; the agent produces `Beat` and never this.
 *
 * Milliseconds, not seconds and not frames. There are exactly two conversions in the
 * system — seconds to ms at the edge of `packages/voice`, ms to frames in the compiler.
 */
export type TimedBeat = Beat & { fromMs: number; toMs: number };

/* ------------------------------------------------------------------ events */

/** What the agent writes: a symbolic anchor plus a closed-vocabulary action. */
export type SemanticEvent = {
  at: string;
  action: string;
  payload?: Record<string, unknown>;
};

/** What the compiler produces: the same event, resolved onto an absolute frame. */
export type TimedEvent = {
  frame: number;
  action: string;
  payload?: Record<string, unknown>;
};

export type ActionDef = {
  description: string;
  payload: z.ZodType | null;
};

/* ------------------------------------------------------------------ layouts */

export type LayoutDef = {
  /** Typed internal slots. These accept primitives, never other scenes. */
  slots: string[];
  description: string;
};

/* -------------------------------------------------------------- constraints */

export type FieldConstraint = {
  recommendedMin?: number;
  recommendedMax?: number;
  absoluteMax?: number;
  onExceed?: string;
  onEmpty?: string;
  /**
   * Which warning a breach of `recommendedMax` raises. It lives here, on the field that
   * knows what it is, rather than in the validator: a generic validator matching field
   * *names* to decide that "title" and "headline" mean density would need one more
   * branch for every capability that invents another word for a heading.
   */
  onExceedCode?: Extract<CompilerWarningCode, 'SOFT_LIMIT_EXCEEDED' | 'TITLE_DENSITY'>;
};

export type SoftConstraints = Record<string, FieldConstraint>;

/* -------------------------------------------------------------- capability */

export type SceneFamily = 'data' | 'context' | 'character' | 'typography' | 'geo' | 'diagram';

export type SceneMeta = {
  id: string;
  name: string;
  family: SceneFamily;
  summary: string;
  useWhen: string[];
  avoidWhen: string[];
  supportsEvents: boolean;
  requiresAssets: boolean;
  occupiesRegions: Slot[];
  supportedCompositions: Slot[];
  minDurationFrames: number;
  recommendedDurationFrames: number;
};

/** One entry of the catalog. Defined by code, generated at build, immutable at runtime. */
export type SceneCapability = {
  meta: SceneMeta;
  schema: z.ZodType;
  constraints: SoftConstraints;
  actions: Record<string, ActionDef>;
  layouts: Record<string, LayoutDef>;
  examples: SceneExample[];
  component: React.ComponentType<SceneProps<never>>;
  /**
   * Referential checks the generic validator cannot express — a `highlight` naming a
   * label that is not in `data`, for instance. Optional, but this is where the
   * "renders fine, animates nothing" class of bug gets caught.
   */
  checks?: (instance: SceneInstance) => {
    errors: CompilerError[];
    warnings: CompilerWarning[];
  };
};

/** One use of a capability inside one video. */
export type SceneInstance = {
  id: string;
  component: string;
  props: Record<string, unknown>;
  layout?: string;
  motionProfile?: MotionProfileId;
  events?: SemanticEvent[];
  /**
   * Required and non-empty. A scene's duration is the sum of the beats it spans, so a
   * scene that spans nothing has no duration — the optional form let that be expressed.
   */
  spansBeats: string[];
  pace?: Pace;
};

/* ------------------------------------------------------ persistent elements */

/**
 * A persistent element's slot at an anchor. Placements are to persistent elements what
 * events are to scenes: the agent writes them symbolically, the compiler folds them into
 * the `layoutStates` of the compiled document.
 */
export type Placement = { at: string; slot: Slot };

/** Declared on the section, never by scene nesting. */
export type PersistentElement = {
  id: string;
  element: 'character' | 'image' | 'label';
  asset?: AssetRef;
  placements: Placement[];
};

/**
 * An example is a SceneInstance plus the bit of framing a human needs to read the
 * grid. Examples are normative: the agent imitates them far more faithfully than it
 * follows a description, so they carry semantic anchors, never frames.
 */
export type SceneExample = SceneInstance & {
  title: string;
  note: string;
};

/* ------------------------------------------------------------ scene runtime */

export type SceneProps<P> = {
  props: P;
  /** Resolver output keyed by the semantic requirement field. Never authored by an agent. */
  assets: ResolvedSceneAssets;
  /** Layout id, resolved from the instance. Never part of `props`. */
  layout: string;
  events: TimedEvent[];
  safeArea: SafeArea;
  theme: import('../design/theme').Theme;
  profile: import('../design/motion').MotionProfile;
  /** Length of this scene, so components can time a closing hold. */
  durationInFrames: number;
};

/* ---------------------------------------------------------------- reporting */

export type CompilerErrorCode =
  | 'UNKNOWN_CAPABILITY'
  | 'INVALID_PROPS'
  | 'UNKNOWN_ACTION'
  | 'UNKNOWN_LAYOUT'
  | 'INVALID_PAYLOAD'
  | 'UNKNOWN_ANCHOR'
  | 'UNKNOWN_SLOT'
  | 'BELOW_MIN_DURATION'
  | 'MISSING_ASSET_REFERENCE'
  /* The structural gate. A plan arriving as JSON has none of the guarantees its
   * TypeScript type makes, and every semantic check downstream assumes them. */
  | 'MALFORMED_PLAN'
  | 'DUPLICATE_ID'
  /* The beat partition. Three codes rather than one, because they are three different
   * corrections to feed back to the agent. Each carries `sectionId` when it fires over
   * the scenes of a section and omits it when it fires over the sections of a plan,
   * which is how the report says which of the two partitions broke. */
  | 'BEAT_NOT_CONTIGUOUS'
  | 'BEAT_DOUBLE_BOOKED'
  | 'BEAT_UNCOVERED'
  | 'EMPTY_BEAT_SPAN'
  | 'SCENE_CUTS_MID_SENTENCE'
  /* A plan beat the voice-over never spoke. The compiler has no duration for it, and
   * every window derived from it would be silently wrong rather than absent. */
  | 'MISSING_BEAT_TIMING'
  /* Timings that are not a projection of the plan: out of order, non-finite, reversed,
   * gapped, or spoken from text the plan no longer contains. One code rather than the
   * beat partition's three, because these are not three corrections an agent can make —
   * rule 3 forbids an agent from writing a timing, so the only repair is to synthesise
   * again and the message carries which property broke. */
  | 'INVALID_TIMING_INPUT';

export type CompilerError = {
  code: CompilerErrorCode;
  sceneId?: string;
  sectionId?: string;
  field?: string;
  message: string;
  /** Valid alternatives, when the failure is a bad identifier. */
  expected?: string[];
};

export type CompilerWarningCode =
  | 'SOFT_LIMIT_EXCEEDED'
  | 'SLOT_RELOCATED'
  | 'PERSISTENT_ELEMENT_HIDDEN'
  | 'ASSET_PLACEHOLDER'
  | 'MOTION_PROFILE_REPETITION'
  | 'TITLE_DENSITY'
  | 'SCENE_BELOW_RECOMMENDED_DURATION';

export type CompilerWarning = {
  code: CompilerWarningCode;
  severity: 'info' | 'quality' | 'important';
  sceneId?: string;
  sectionId?: string;
  field?: string;
  message: string;
  suggestion?: string;
};

export type CompileReport = {
  ok: boolean;
  errors: CompilerError[];
  warnings: CompilerWarning[];
};

export const emptyReport = (): CompileReport => ({ ok: true, errors: [], warnings: [] });
