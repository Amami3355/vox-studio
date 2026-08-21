/**
 * Core contracts shared by every layer.
 *
 * The single most important distinction in this file is SceneCapability vs
 * SceneInstance. A capability is what exists in the catalog (8-12 of them, defined by
 * code, immutable at runtime). An instance is what exists in one video (dozens per
 * project, authored by the agent, edited by the user, serialised into the document).
 * No code may blur that boundary.
 */
import { z } from 'zod';
import type { MotionProfileId, Pace } from '../design/motion';
import type { AssetRef, AssetRequirement, ResolvedSceneAssets } from './assets';
import {
  COMPILER_CHECKS,
  type CompilerErrorCode,
  type CompilerWarningCode,
  type CompilerWarningSeverityFor,
} from './compiler-checks';

export type { AssetRef, AssetRequirement, ResolvedSceneAssets } from './assets';
export type { CompilerErrorCode, CompilerWarningCode } from './compiler-checks';

/* ------------------------------------------------------------------ layout */

export const ALL_SLOTS = [
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
] as const;

export type Slot = (typeof ALL_SLOTS)[number];

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
 * One spoken word and the moment it begins. No end: a word's end is not a thing any
 * anchor names, and the next word's onset is the only boundary the picture ever cuts on.
 */
export type TimedWord = { text: string; fromMs: number };

/**
 * A beat plus its real bounds, as spoken. Produced by `packages/voice` from the TTS
 * timepoints; the agent produces `Beat` and never this.
 *
 * Milliseconds, not seconds and not frames. There are exactly two conversions in the
 * system — seconds to ms at the edge of `packages/voice`, ms to frames in the compiler.
 *
 * `words` is required rather than optional, for the reason ADR-0002 made `spansBeats`
 * required: a take without them is not a take with less detail, it is a take no word
 * anchor can be resolved against, and an optional field would let that failure arrive at
 * the anchor instead of at the take. They are also not new information — a beat already
 * carries its text verbatim, and the words are that text tokenised with the onsets the
 * character alignment always contained. Nothing here has to be kept in sync with the
 * text; `checkTimings` proves it was derived from it.
 */
export type TimedBeat = Beat & { fromMs: number; toMs: number; words: TimedWord[] };

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
  /**
   * The payload fields whose value is a word the narrator speaks, and which this event
   * must therefore *land on* — deixis: the meaning depends on the moment of utterance.
   *
   * A `highlightBar` is a pointing gesture. It says "this one", and "this one" is only
   * true while the narrator is saying the thing pointed at; the bar lighting up 150 frames
   * after the word has passed is a defect visible to anyone watching and to nothing else in
   * this repository. So it declares `['label']`, and the anchor to write for it is the word
   * form: `b3.word:London`, not `b3.start`.
   *
   * `annotate` declares nothing, and the distinction is the reason this is a list of fields
   * rather than a flag on the action. Its `label` names a spoken word too — it is the same
   * bar — but the note's timing follows the sentence that *justifies* it, which may be a
   * beat away. Holding it to the landing rule would be wrong rather than strict.
   *
   * Absent means "no field of this payload is deictic". That default is permissive on
   * purpose — most actions point at nothing — but it is the residual risk here, and worth
   * naming: a *new* pointing gesture that forgets to declare is unchecked and silent, which
   * is the same shape as the defect the whole thing repairs, one level up. What is guarded
   * is that a declaration made is a declaration that works: `catalog-contract` rejects a
   * field the payload does not carry, since that would read undefined and check nothing.
   */
  deicticFields?: string[];
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
  /**
   * How many entries of `seriesField` this capability keeps, per composition and per
   * layout. Absent for capabilities whose output does not depend on a count.
   *
   * **Declared, never computed.** ADR-0003 decision 4 keeps scene geometry out of the
   * compiler — `safeArea` is the translation, not a second layout system — so the compiler
   * may not work this number out. It may only be *told*, in the same way
   * `supportedCompositions` tells it which shapes exist. That is what lets the compile
   * report say "this scene yielded into `left`, where it holds 3, and your plan has 5"
   * without the compiler ever knowing what a column pitch is.
   *
   * **The number is a floor, not a forecast.** The real capacity also moves with the
   * camera allowance, which belongs to the motion profile: in a half frame the vertical
   * form holds 4 under `impact` and 3 under `pushIn`. Publishing the smallest value across
   * every profile is the only figure that is true whatever the plan chooses, and warning
   * slightly early is the safe direction — the repair is the same either way.
   *
   * **Both axes are load-bearing.** A half frame holds 3 vertical columns and 8 horizontal
   * rows, because columns are bounded by the width their labels need and rows by height.
   * Indexing on composition alone would publish one of those two numbers as though it were
   * both, which is the defect this field exists to end.
   *
   * `tests/render/composed-capacity.test.ts` holds every entry to what the scene actually
   * computes. A number here that nothing checks is `constraints.ts`'s "top 8" again.
   */
  capacityByComposition?: Partial<Record<Slot, Record<string, number>>>;
  /**
   * The prop holding the series `capacityByComposition` counts, e.g. `'data'`.
   *
   * The compiler is generic and `props.data` means nothing to it. Naming the field is what
   * lets it reuse `aggregateBeyond` and learn not only how many entries would be collapsed
   * but *which labels*, which is what the narration-coherence check reads.
   */
  seriesField?: string;
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

/**
 * Declared on the section, never by scene nesting.
 *
 * `assetRequirement`, not `asset`. This field was typed `AssetRef` until ADR-0005, which
 * meant a plan could hand an element a *location* — and the vertical slice did, with an
 * inline `data:` URI for its narrator. `core/assets.ts` has said all along that the agent
 * writes the requirement and may never write the reference; scenes were held to it because
 * a scene has to go through the resolver to get a picture at all, and elements were not
 * because they had a channel that let them skip it. Same rule, same resolver, same
 * identity cache: an element sharing an `identityKey` with a scene now shares its picture.
 */
export const PERSISTENT_ELEMENT_TYPES = ['character', 'image', 'label'] as const;

export type PersistentElement = {
  id: string;
  element: (typeof PERSISTENT_ELEMENT_TYPES)[number];
  assetRequirement?: AssetRequirement;
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

export type CompilerError = {
  code: CompilerErrorCode;
  sceneId?: string;
  sectionId?: string;
  field?: string;
  message: string;
  /** Valid alternatives, when the failure is a bad identifier. */
  expected?: string[];
};

type CompilerWarningFields = {
  sceneId?: string;
  sectionId?: string;
  field?: string;
  message: string;
  suggestion?: string;
};

export type CompilerWarning = {
  [Code in CompilerWarningCode]: CompilerWarningFields & {
    code: Code;
    severity: CompilerWarningSeverityFor<Code>;
  };
}[CompilerWarningCode];

export type CompileReport = {
  ok: boolean;
  errors: CompilerError[];
  warnings: CompilerWarning[];
};

const compilerErrorCodeSchema = z.enum(
  Object.keys(COMPILER_CHECKS.errors) as [CompilerErrorCode, ...CompilerErrorCode[]],
);
const compilerWarningCodeSchema = z.enum(
  Object.keys(COMPILER_CHECKS.warnings) as [CompilerWarningCode, ...CompilerWarningCode[]],
);
const compilerLocationSchema = {
  sceneId: z.string().optional(),
  sectionId: z.string().optional(),
  field: z.string().optional(),
};

/** Strict runtime gate for persisted validation and compilation reports. */
const runtimeCompileReportSchema = z
  .object({
    ok: z.boolean(),
    errors: z.array(
      z
        .object({
          code: compilerErrorCodeSchema,
          ...compilerLocationSchema,
          message: z.string().min(1),
          expected: z.array(z.string()).optional(),
        })
        .strict(),
    ),
    warnings: z.array(
      z
        .object({
          code: compilerWarningCodeSchema,
          severity: z.enum(['info', 'quality', 'important']),
          ...compilerLocationSchema,
          message: z.string().min(1),
          suggestion: z.string().optional(),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((report, context) => {
    if (report.ok !== (report.errors.length === 0)) {
      context.addIssue({
        code: 'custom',
        path: ['ok'],
        message: 'CompileReport.ok must equal whether errors is empty.',
      });
    }
    for (const [index, warning] of report.warnings.entries()) {
      const allowed = COMPILER_CHECKS.warnings[warning.code].severity as readonly string[];
      if (!allowed.includes(warning.severity)) {
        context.addIssue({
          code: 'custom',
          path: ['warnings', index, 'severity'],
          message: `${warning.code} does not allow severity ${warning.severity}.`,
        });
      }
    }
  });

export const compileReportSchema =
  runtimeCompileReportSchema as unknown as z.ZodType<CompileReport>;

export const emptyReport = (): CompileReport => ({ ok: true, errors: [], warnings: [] });
