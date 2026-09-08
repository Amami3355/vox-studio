import type { EventReducer } from '../../core/events';
import type { ImageFocus, ImageRegion } from '../../primitives';
export type ImageDetailState = { focuses: ImageFocus[]; note: string | null; noteFrame: number };
export const initialImageDetailState = (): ImageDetailState => ({
  focuses: [],
  note: null,
  noteFrame: 0,
});
export const imageDetailReducer: EventReducer<ImageDetailState> = (state, event) => {
  switch (event.action) {
    case 'focus':
      return {
        ...state,
        focuses: [
          ...state.focuses,
          { frame: event.frame, region: event.payload?.region as ImageRegion },
        ],
      };
    case 'annotate':
      return { ...state, note: String(event.payload?.text), noteFrame: event.frame };
    case 'clearAnnotation':
      return { ...state, note: null };
    default:
      return state;
  }
};
