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
