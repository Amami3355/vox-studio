export type LegendLayout = {
  entries: Array<{ x: number; row: number }>;
  rows: number;
};

/** Pack measured legend entries into rows without changing their authored order. */
export const layoutLegendEntries = (
  widths: number[],
  available: number,
  gap: number,
): LegendLayout => {
  if (widths.length === 0) return { entries: [], rows: 0 };

  const entries: LegendLayout['entries'] = [];
  let x = 0;
  let row = 0;
  for (const width of widths) {
    if (x > 0 && x + width > available) {
      x = 0;
      row += 1;
    }
    entries.push({ x, row });
    x += width + gap;
  }
  return { entries, rows: row + 1 };
};

export type DateLabelCandidate = { index: number; x: number; width: number };
export type DateLabelPlacement = DateLabelCandidate & {
  /** Centre used by the SVG text node after edge clamping. */
  drawX: number;
  start: number;
  end: number;
  lane: number;
};

const bounded = (
  candidate: DateLabelCandidate,
  left: number,
  right: number,
): Omit<DateLabelPlacement, 'lane'> => {
  const width = Math.min(candidate.width, Math.max(0, right - left));
  const start = Math.min(right - width, Math.max(left, candidate.x - width / 2));
  return { ...candidate, width, drawX: start + width / 2, start, end: start + width };
};

/**
 * Keep the semantic labels (first, last, focus and annotation) and move collisions onto
 * additional lanes. Ordinary candidates may use two lanes but never create more visual noise.
 */
export const layoutDateLabels = ({
  candidates,
  required,
  left,
  right,
  gap,
}: {
  candidates: DateLabelCandidate[];
  required: ReadonlySet<number>;
  left: number;
  right: number;
  gap: number;
}): DateLabelPlacement[] => {
  const lanes: DateLabelPlacement[][] = [];
  const placed: DateLabelPlacement[] = [];
  const ordered = [...candidates].sort((a, b) => a.x - b.x || a.index - b.index);

  const place = (candidate: DateLabelCandidate, mayCreateLane: boolean): boolean => {
    const box = bounded(candidate, left, right);
    const laneLimit = mayCreateLane ? lanes.length + 1 : Math.max(2, lanes.length);
    for (let lane = 0; lane < laneLimit; lane += 1) {
      const occupants = lanes[lane] ?? [];
      const fits = occupants.every(
        (other) => box.end + gap <= other.start || other.end + gap <= box.start,
      );
      if (!fits) continue;
      const placement = { ...box, lane };
      if (!lanes[lane]) lanes[lane] = [];
      lanes[lane]?.push(placement);
      placed.push(placement);
      return true;
    }
    return false;
  };

  for (const candidate of ordered.filter((one) => required.has(one.index))) place(candidate, true);
  for (const candidate of ordered.filter((one) => !required.has(one.index)))
    place(candidate, false);

  return placed.sort((a, b) => a.index - b.index);
};

const splitTokenToWidth = (
  token: string,
  available: number,
  widthOf: (candidate: string) => number,
): string[] => {
  const remaining = Array.from(token);
  const pieces: string[] = [];
  while (remaining.length > 0) {
    let low = 1;
    let high = remaining.length;
    let fit = widthOf(remaining[0] as string) <= available ? 1 : 0;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (widthOf(remaining.slice(0, middle).join('')) <= available) {
        fit = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    // A box narrower than one glyph cannot preserve and contain the text simultaneously.
    // Keeping the glyph is the honest direction; every LinePlot box is wider than one glyph.
    const take = Math.max(1, fit);
    pieces.push(remaining.splice(0, take).join(''));
  }
  return pieces;
};

/** Greedy measured wrapping with a character fallback for one unbreakable token. */
export const wrapTextToWidth = (
  text: string,
  available: number,
  widthOf: (candidate: string) => number,
): string[] => {
  const words = text.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (words.length === 0) return [];
  if (available <= 0) return [words.join(' ')];

  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line === '' ? word : `${line} ${word}`;
    if (widthOf(candidate) <= available) {
      line = candidate;
      continue;
    }
    if (line !== '') {
      lines.push(line);
      line = '';
    }
    const pieces = splitTokenToWidth(word, available, widthOf);
    lines.push(...pieces.slice(0, -1));
    line = pieces.at(-1) ?? '';
  }
  if (line !== '') lines.push(line);
  return lines;
};

/** A zero-width reveal is still held; equality at x=0 must not leak the first marker. */
export const pointIsRevealed = (position: number, revealProgress: number): boolean =>
  revealProgress > 0 && position <= revealProgress + 0.001;
