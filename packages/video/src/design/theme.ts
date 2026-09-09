/**
 * L0 — Design system tokens.
 *
 * No JSX lives here. Only constants. Every colour, size, spacing and radius used
 * anywhere in the scene library must resolve to a value defined in this file.
 */

export type Theme = {
  id: string;
  name: string;
  color: {
    bg: string;
    surface: string;
    ink: string;
    inkMuted: string;
    accent: string;
    accentAlt: string;
    positive: string;
    negative: string;
    /** Ordered ramp, warm (emphasis) to cold (recessive). At least 6 entries. */
    dataSeries: string[];
  };
  type: {
    display: string;
    /**
     * The second display face, for the one register the first cannot reach.
     *
     * A role and not a decoration. `display` is a grotesque and carries every heading,
     * label and figure in the system; a chapter card sets one sentence as the whole frame
     * and wants the voice a serif has. `theme.ts` already anchors `editorial-paper` on The
     * Economist and the FT, and both title in serif — so this is the reference being
     * honoured rather than a departure from it.
     *
     * It lives here rather than in the capability that wanted it, for the reason every
     * other token does: a second theme inherits it, and no scene may invent a family.
     */
    displayAlt: string;
    body: string;
    mono: string;
    /** Typographic scale in px, ascending. */
    scale: number[];
    tracking: { tight: number; normal: number; wide: number };
    weight: { regular: number; medium: number; bold: number };
  };
  /** Spacing scale in px, ascending. */
  space: number[];
  grid: { columns: number; margin: number; gutter: number };
  radius: number[];
};

/**
 * Semantic role an agent may pick per scene. Never a raw colour.
 *
 * The list is the runtime form of the union, so a projection that publishes the vocabulary
 * an agent may select from reads it here rather than restating it.
 */
export const emphasisRoles = ['neutral', 'positive', 'negative'] as const;

export type EmphasisRole = (typeof emphasisRoles)[number];

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/** Photography uses light ink in both themes. The scrim's minimum opacity applies
 * across the whole text box, including over a white image. Feathering starts outside. */
export const imageOverlay = {
  ink: '#FFFFFF',
  secondaryInk: '#E5E7EB',
  ground: '#0B0E13',
  scrimRgb: '11, 14, 19',
  minimumOpacity: 0.82,
  edgeOpacity: 0.94,
  titleStep: 4,
  captionStep: 1,
  captionLineHeight: 1.35,
} as const;

/** Explanatory copy stays quieter than an establishing-shot title. */
export const imageDetailType = { titleStep: 3 } as const;

/**
 * `editorial-cold` — Ember on Slate.
 *
 * A single saturated warm accent on a cold near-black. The warm/cold split is what
 * produces an instantly identifiable dominant element, which is the first line of
 * the quality grid.
 */
export const editorialCold: Theme = {
  id: 'editorial-cold',
  name: 'Editorial Cold',
  color: {
    bg: '#0B0E13',
    surface: '#141922',
    ink: '#F2EFE9',
    inkMuted: '#8A94A6',
    accent: '#FF5A1F',
    accentAlt: '#FFB800',
    positive: '#3DD68C',
    negative: '#FF4D4D',
    dataSeries: ['#FF5A1F', '#F2873C', '#E0A75B', '#A8A08F', '#7A8394', '#5A6475'],
  },
  type: {
    // Populated by design/fonts.ts at module load; these are the fallback stacks.
    display: 'Archivo, system-ui, sans-serif',
    displayAlt: '"Instrument Serif", Georgia, "Times New Roman", serif',
    body: 'Inter, system-ui, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, monospace',
    scale: [28, 36, 48, 64, 88, 120, 168],
    tracking: { tight: -0.02, normal: 0, wide: 0.08 },
    weight: { regular: 400, medium: 600, bold: 800 },
  },
  space: [0, 8, 16, 24, 40, 64, 96, 144],
  grid: { columns: 12, margin: 96, gutter: 24 },
  radius: [0, 4, 8, 16, 999],
};

/**
 * `editorial-paper` — Ember on Paper.
 *
 * The same system on a light ground. Composition anchors on The Economist and the FT, both
 * of which build their identity on a warm off-white rather than pure white, and that is the
 * reason this is `#F7F4EE` and not `#FFFFFF`: a full-canvas white at 1920×1080, held for
 * three minutes, is a brightness a printed page never has to answer for.
 *
 * Only the palette differs, so it is written as one — the type scale, the spacing, the grid
 * and the radii are structural decisions that do not change with the ground, and spreading
 * them is what keeps that true. A theme that forked the scale would be a second design
 * system wearing the first one's interface.
 *
 * **Every value below clears 4.5:1 against the ground**, which the dark theme gets for free
 * and a light one does not: `#FF5A1F` is 6.20:1 on slate and 2.60:1 on paper, so the warm
 * accent had to be deepened rather than reused. `Eyebrow` and the `Callout` label draw
 * *text* in `accent` and `accentAlt`, which is why those two are held to a text ratio and
 * not to the 3:1 a bar fill would justify.
 *
 * The ramp inverts its direction, not its order. On slate a recessive series member sinks by
 * getting darker; on paper it sinks by getting lighter and less saturated. Warm to cold is
 * preserved, so `rampColor` and the highlight recede in `Bar` behave identically.
 */
export const editorialPaper: Theme = {
  ...editorialCold,
  id: 'editorial-paper',
  name: 'Editorial Paper',
  color: {
    bg: '#F7F4EE',
    surface: '#EDE8DF',
    ink: '#14171C',
    inkMuted: '#626A78',
    accent: '#C23C0A',
    accentAlt: '#9C6200',
    positive: '#157F4A',
    negative: '#C0342B',
    dataSeries: ['#C23C0A', '#B05A16', '#9C7431', '#8C8355', '#7C8477', '#6E7F96'],
  },
};

export const themes = {
  'editorial-cold': editorialCold,
  'editorial-paper': editorialPaper,
} as const;

export type ThemeId = keyof typeof themes;

/**
 * Paper is the default as of 2026-08-14.
 *
 * `editorial-cold` is kept rather than replaced, and not out of sentiment: until this commit
 * the theme seam had exactly one adapter, which made it a hypothetical seam — every call
 * site took the default and nothing proved a second palette could reach the frame at all.
 * Two adapters is what turns `ThemeId` into a type with something to say.
 *
 * It is also the palette the frozen Northbridge preview on disk was rendered in. That
 * artifact cannot be regenerated — the paid dispatches are spent — so the theme it was shot
 * in has to remain reachable for it to stay reproducible from source.
 */
export const defaultTheme = editorialPaper;

/** Resolve a semantic emphasis role to a concrete colour from the theme. */
export const emphasisColor = (theme: Theme, role: EmphasisRole): string => {
  switch (role) {
    case 'positive':
      return theme.color.positive;
    case 'negative':
      return theme.color.negative;
    default:
      return theme.color.accent;
  }
};

/**
 * Mix two hex colours. Used to recede non-highlighted elements toward the
 * background rather than reaching for an undocumented grey.
 */
export const mix = (a: string, b: string, amount: number): string => {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const t = Math.min(1, Math.max(0, amount));
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return rgbToHex(c(pa[0], pb[0]), c(pa[1], pb[1]), c(pa[2], pb[2]));
};

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
};

const rgbToHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/**
 * Colour for item `index` of `count`, sampled along the data ramp.
 *
 * Sampled, not indexed: `dataSeries` is an ordered warm-to-cold ramp, and cycling it
 * with a modulo makes the seventh bar identical to the first — which reads as an
 * emphasis nobody asked for. Interpolating spreads the ramp across however many items
 * there are.
 */
export const rampColor = (ramp: string[], index: number, count: number): string => {
  const first = ramp[0];
  if (!first) return '#888888';
  if (count <= 1 || ramp.length === 1) return first;
  const t = (Math.min(index, count - 1) / (count - 1)) * (ramp.length - 1);
  const lo = Math.floor(t);
  const hi = Math.min(ramp.length - 1, lo + 1);
  return mix(ramp[lo] as string, ramp[hi] as string, t - lo);
};

/** Read a scale entry, clamped to the ends of the scale. */
export const scaleStep = (scale: number[], index: number): number => {
  const i = Math.min(scale.length - 1, Math.max(0, index));
  return scale[i] as number;
};
