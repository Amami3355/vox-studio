import type { EventReducer } from '../../core/events';
import type { ImageFocus, ImageRegion } from '../../primitives';
export type ImageDetailState = {
  focuses: ImageFocus[];
  note: string | null;
  noteFrame: number;
  introVisible: boolean;
};
export const initialImageDetailState = (): ImageDetailState => ({
  focuses: [],
  note: null,
  noteFrame: 0,
  introVisible: true,
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
      return {
        ...state,
        note: String(event.payload?.text),
        noteFrame: event.frame,
        introVisible: false,
      };
    case 'clearAnnotation':
      return { ...state, note: null, introVisible: false };
    default:
      return state;
  }
};
