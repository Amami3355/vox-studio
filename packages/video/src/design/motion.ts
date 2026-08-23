/**
 * L0 — Motion tokens and motion profiles.
 *
 * Motion is exposed to the agent as a *role*, never as a spring config or a frame
 * count. A single universal drift applied everywhere becomes the recognisable
 * signature of an automated system; stillness is a motion design tool too.
 */

export const motion = {
  spring: {
    settle: { damping: 30, mass: 1, stiffness: 80 },
    snap: { damping: 12, mass: 0.4, stiffness: 200 },
    soft: { damping: 200, mass: 0.6, stiffness: 120 },
  },
  /** Frames @ 30fps. */
  duration: { instant: 6, quick: 12, base: 20, slow: 34 },
  stagger: { tight: 2, base: 4, loose: 7 },
} as const;

export type SpringToken = keyof typeof motion.spring;
export type StaggerToken = keyof typeof motion.stagger;
export type EntranceToken = 'stagger' | 'unison';

export type CameraSpec =
  | { type: 'none' }
  | { type: 'drift'; amount: number }
  | { type: 'pushIn'; amount: number }
  | { type: 'panDrift'; amount: number };

export type MotionProfile = {
  camera: CameraSpec;
  entrance: EntranceToken;
  spring: SpringToken;
  stagger: StaggerToken;
  intent: string;
};

export const motionProfiles = {
  editorialStatic: {
    camera: { type: 'none' },
    entrance: 'stagger',
    spring: 'settle',
    stagger: 'base',
    intent: 'Declaration, quote, isolated figure. The text must hold on its own.',
  },
  subtleDrift: {
    camera: { type: 'drift', amount: 0.04 },
    entrance: 'stagger',
    spring: 'settle',
    stagger: 'base',
    intent: 'Context, background image, continuous narration. Default profile.',
  },
  pushIn: {
    camera: { type: 'pushIn', amount: 0.12 },
    entrance: 'stagger',
    spring: 'settle',
    stagger: 'loose',
    intent: 'Rising tension, progressive reveal.',
  },
  energetic: {
    camera: { type: 'pushIn', amount: 0.06 },
    entrance: 'stagger',
    spring: 'snap',
    stagger: 'tight',
    intent: 'Fast data, enumeration, sustained rhythm.',
  },
  impact: {
    camera: { type: 'none' },
    entrance: 'unison',
    spring: 'snap',
    stagger: 'tight',
    intent:
      'Blunt reveal. The full table or typographic composition lands at once. Reserve for impact or turning-point beats.',
  },
  cinematic: {
    camera: { type: 'panDrift', amount: 0.08 },
    entrance: 'stagger',
    spring: 'settle',
    stagger: 'loose',
    intent: 'Opening, conclusion, wide shot on a strong asset.',
  },
} as const satisfies Record<string, MotionProfile>;

export type MotionProfileId = keyof typeof motionProfiles;

export const motionProfileIds = Object.keys(motionProfiles) as [
  MotionProfileId,
  ...MotionProfileId[],
];

export const getMotionProfile = (id: MotionProfileId): MotionProfile => motionProfiles[id];

/** Frames between two staggered siblings, per the profile. `unison` collapses to 0. */
export const staggerFrames = (profile: MotionProfile): number =>
  profile.entrance === 'unison' ? 0 : motion.stagger[profile.stagger];

export const springConfig = (profile: MotionProfile) => motion.spring[profile.spring];

/**
 * Reusable motion grammar for a whole graphic object that should feel alive without
 * implying articulated movement.
 *
 * Scenes consume the normalised samples below and decide only how much of their own
 * layout allowance to spend. Cadence, phase and easing live here in L0, alongside the
 * other motion decisions, so a SceneCapability never invents a duration or curve.
 */
const graphicMotion = {
  ambientCycleFrames: motion.duration.slow * 8,
  accentWindowFrames: motion.duration.base * 2,
  ambientVerticalShare: 0.5,
  ambientTiltPhase: 1,
} as const;

export type AmbientGraphicMotion = {
  horizontal: number;
  vertical: number;
  tilt: number;
};

/** One deterministic sample from the design system's restrained ambient loop. */
export const ambientGraphicMotionAt = (frame: number): AmbientGraphicMotion => {
  const phase = (frame / graphicMotion.ambientCycleFrames) * Math.PI * 2;
  return {
    horizontal: Math.sin(phase),
    vertical: Math.cos(phase) * graphicMotion.ambientVerticalShare,
    tilt: Math.sin(phase + graphicMotion.ambientTiltPhase),
  };
};

/**
 * A reversible emphasis envelope: zero at the event, one at the midpoint, and exactly
 * zero again once the design-owned window has passed.
 */
export const graphicAccentAt = (frame: number, startFrame: number | null): number => {
  if (startFrame === null) return 0;
  const elapsed = frame - startFrame;
  if (elapsed < 0 || elapsed > graphicMotion.accentWindowFrames) return 0;
  return Math.sin((elapsed / graphicMotion.accentWindowFrames) * Math.PI);
};

/**
 * Pace is a rhythm token, not a duration. It scales how tightly events are packed
 * inside a scene; it never sets the scene length, which comes from the beats.
 */
export const paceIds = ['quick', 'measured', 'slow'] as const;

export type Pace = (typeof paceIds)[number];

export const paceMultiplier: Record<Pace, number> = {
  quick: 0.72,
  measured: 1,
  slow: 1.35,
};

export type Hold = 'none' | 'short' | 'long';

export const holdFrames: Record<Hold, number> = {
  none: 0,
  short: motion.duration.base,
  long: motion.duration.slow * 2,
};
