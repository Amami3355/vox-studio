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

/** Parse one strict calendar date at UTC midnight. Locale and host timezone never participate. */
export const parseUtcDate = (value: string): number | null => {
  const match = UTC_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return Date.UTC(year, month - 1, day);
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
 * dates throw rather than being sorted into a plausible but unauthored trend.
 */
export const utcTimeAxis = (dates: string[], maximumTicks = 6): TimeAxis => {
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

  const first = timestamps[0] ?? 0;
  const last = timestamps.at(-1) ?? first;
  const span = last - first;
  const ratio = (timestamp: number): number => (span === 0 ? 0.5 : (timestamp - first) / span);

  return {
    timestamps,
    positions: timestamps.map(ratio),
    tickIndices: timeTickIndices(timestamps.length, maximumTicks),
    ratio,
  };
};
