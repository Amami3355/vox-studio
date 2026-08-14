/**
 * The width of the column the current subtree is being laid out in, in canvas px.
 *
 * Text has to know this and cannot derive it. `SlotFrame` publishes the box the *scene*
 * got; a layout then divides that box into columns, and which column a given line of type
 * landed in is knowledge only the layout has. A CSS percentage resolves at layout time,
 * which is too late for a component that has to choose a type size while rendering.
 *
 * So the layout says it once, the same way `SlotFrame` says density once, and every text
 * primitive below reads it. The default is the whole frame box, which is the correct answer
 * for a scene that never split it — a header spanning the canvas needs no provider.
 *
 * Provider only, no element. Wrapping a grid or flex child in a real div would change the
 * layout it is describing, which is the one thing this must not do.
 */
import type React from 'react';
import { createContext, useContext } from 'react';
import { useFrameBox } from './SlotFrame';

const ColumnCtx = createContext<number | null>(null);

export const ColumnProvider: React.FC<{ width: number; children: React.ReactNode }> = ({
  width,
  children,
}) => <ColumnCtx.Provider value={width}>{children}</ColumnCtx.Provider>;

export const useColumnWidth = (): number => {
  const declared = useContext(ColumnCtx);
  const box = useFrameBox();
  return declared ?? box.width;
};
