/**
 * Slot geometry — the first and only place a slot has a size.
 *
 * ADR-0003 decision 5: one table. Overlap is rectangle intersection over it, and a
 * `safeArea` is derived from it, so the symbolic relation the agent speaks and the
 * percentages the component receives cannot drift apart.
 *
 * The compiler is the only consumer. A component that imports this file is reading a
 * vocabulary it is specified never to see.
 */
import type { Slot } from './types';

/**
 * A region of the canvas, as percentages *inset from each edge* — the same shape and the
 * same reading as `SafeArea`, which is what lets a chosen composition become a safe area
 * without a conversion. `{ top: 0, right: 50, bottom: 0, left: 0 }` is the left half.
 */
export type Rect = { top: number; right: number; bottom: number; left: number };

/**
 * Corners are 30% squares and `center` is the middle 40%, so a corner *touches* the
 * centre without overlapping it. Any larger corner would put a character badge in
 * permanent conflict with every centred composition, which would make
 * `PERSISTENT_ELEMENT_HIDDEN` the normal outcome rather than the last resort.
 */
const SLOT_RECTS: Record<Slot, Rect> = {
  full: { top: 0, right: 0, bottom: 0, left: 0 },
  left: { top: 0, right: 50, bottom: 0, left: 0 },
  right: { top: 0, right: 0, bottom: 0, left: 50 },
  top: { top: 0, right: 0, bottom: 50, left: 0 },
  bottom: { top: 50, right: 0, bottom: 0, left: 0 },
  center: { top: 30, right: 30, bottom: 30, left: 30 },
  cornerTL: { top: 0, right: 70, bottom: 70, left: 0 },
  cornerTR: { top: 0, right: 0, bottom: 70, left: 70 },
  cornerBL: { top: 70, right: 70, bottom: 0, left: 0 },
  cornerBR: { top: 70, right: 0, bottom: 0, left: 70 },
};

export const slotRect = (slot: Slot): Rect => SLOT_RECTS[slot];

/**
 * Do two slots contend for canvas? Positive area of intersection, so slots that merely
 * share an edge — `left` and `right`, `center` and any corner — do not.
 */
export const overlaps = (a: Slot, b: Slot): boolean => {
  const x = slotRect(a);
  const y = slotRect(b);
  return (
    Math.max(x.left, y.left) < 100 - Math.max(x.right, y.right) &&
    Math.max(x.top, y.top) < 100 - Math.max(x.bottom, y.bottom)
  );
};
