export type TimeAxis = {
  timestamps: number[];
  positions: number[];
  tickIndices: number[];
  ratio: (timestamp: number) => number;
};

const UTC_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const daysInMonth = (year: number, month: number): number => {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
};

/**
 * One UTC midnight from its calendar parts. `Date.UTC(25, ...)` means 1925 by legacy
 * JavaScript rule, so the year is always set explicitly.
 */
export const utcMidnight = (year: number, month: number, day: number): number => {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getTime();
};

/** Parse one strict calendar date at UTC midnight. Locale and host timezone never participate. */
export const parseUtcDate = (value: string): number | null => {
  const match = UTC_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return utcMidnight(year, month, day);
};

/**
 * The calendar readings a dated layout needs, kept here rather than beside the layout that
 * wants them.
 *
 * Not a matter of taste: `tests/render-purity.test.ts` forbids `new Date(` anywhere under
 * `src/primitives`, `src/scenes` or `src/design`, because a frame that reads a clock is a
 * frame that stops reproducing across Remotion's parallel workers. Constructing a `Date`
 * *from a timestamp* is pure — it reads no clock — but the check is deliberately syntactic
 * and deliberately coarse, and widening it to tell the two apart would be widening it to
 * admit the case it exists to catch. `core/` is where the calendar already lives, so this
 * is where the readings live too.
 */
export const utcYearOf = (timestamp: number): number => new Date(timestamp).getUTCFullYear();

/**
 * Whole months between two instants, counted on the calendar rather than divided out of a
 * day count. Thirty-one January days and twenty-eight February days are both one month to a
 * reader, and a scene that said "0.9 months" would be answering a question nobody asked.
 */
export const utcMonthsBetween = (from: number, to: number): number => {
  const start = new Date(from);
  const end = new Date(to);
  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth());
  return Math.max(0, end.getUTCDate() < start.getUTCDate() ? months - 1 : months);
};

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * One date, worded. No locale lookup — the render must be reproducible on any machine,
 * which is the same reason `core/format.ts` groups digits by hand.
 */
export const formatUtcDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()] as string} ${date.getUTCFullYear()}`;
};

const DAY_MS = 86_400_000;

/**
 * How long a stretch of time lasted, in the coarsest unit that still says something.
 *
 * Days below a month, months below two years, years above — because "twenty-six months" is
 * arithmetic and "two years" is a fact, and a duration is printed so a viewer does not have
 * to do the subtraction themselves.
 */
export const formatUtcSpan = (from: number, to: number): string => {
  const months = utcMonthsBetween(from, to);
  if (months < 1) {
    const days = Math.max(1, Math.round((to - from) / DAY_MS));
    return days === 1 ? '1 day' : `${days} days`;
  }
  if (months < 24) return months === 1 ? '1 month' : `${months} months`;
  return `${Math.round(months / 12)} years`;
};

/** Sparse deterministic labels, always retaining the first and last observation. */
export const timeTickIndices = (count: number, maximum = 6): number[] => {
  if (count <= 0 || maximum <= 0) return [];
  if (count <= maximum) return Array.from({ length: count }, (_, index) => index);
  if (maximum === 1) return [0];

  const indices = new Set<number>([0, count - 1]);
  for (let slot = 1; slot < maximum - 1; slot += 1) {
    indices.add(Math.round((slot * (count - 1)) / (maximum - 1)));
  }
  return [...indices].sort((a, b) => a - b);
};

/**
 * Proportional UTC time axis. Written order is binding: invalid, duplicate or descending
 * dates throw rather than being sorted into a plausible but unauthored trend. A supplied
 * domain lets a caller snap the proportional scale beyond the authored observations.
 */
export const utcTimeAxis = (
  dates: string[],
  maximumTicks = 6,
  domain?: { from: number; to: number },
): TimeAxis => {
  const timestamps = dates.map((date) => {
    const parsed = parseUtcDate(date);
    if (parsed === null) throw new Error(`Invalid UTC calendar date "${date}".`);
    return parsed;
  });

  for (let index = 1; index < timestamps.length; index += 1) {
    if ((timestamps[index] as number) <= (timestamps[index - 1] as number)) {
      throw new Error('UTC dates must be strictly increasing in authored order.');
    }
  }

  if (domain && (!Number.isFinite(domain.from) || !Number.isFinite(domain.to))) {
    throw new Error('UTC time-axis domain must contain finite timestamps.');
  }
  if (domain && domain.to <= domain.from) {
    throw new Error('UTC time-axis domain must end after it starts.');
  }

  const first = domain?.from ?? timestamps[0] ?? 0;
  const last = domain?.to ?? timestamps.at(-1) ?? first;
  const span = last - first;
  const ratio = (timestamp: number): number => (span === 0 ? 0.5 : (timestamp - first) / span);

  return {
    timestamps,
    positions: timestamps.map(ratio),
    tickIndices: timeTickIndices(timestamps.length, maximumTicks),
    ratio,
  };
};
