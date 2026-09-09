import { describe, expect, it } from 'vitest';
import { resolveEvents } from '../src/core/events';
import type { TimedEvent } from '../src/core/types';
import { imageDetailSchema } from '../src/scenes/ImageDetailScene/schema';
import { imageDetailReducer, initialImageDetailState } from '../src/scenes/ImageDetailScene/state';

describe('image detail explanation lifecycle', () => {
  it('replaces the introduction, clears permanently, and resolves backwards deterministically', () => {
    const events: TimedEvent[] = [
      { frame: 0, action: 'annotate', payload: { text: 'First explanation' } },
      { frame: 30, action: 'annotate', payload: { text: 'Second explanation' } },
      { frame: 60, action: 'clearAnnotation' },
      { frame: 90, action: 'annotate', payload: { text: 'Another detail' } },
    ];
    const at = (frame: number) =>
      resolveEvents(events, frame, initialImageDetailState(), imageDetailReducer);
    expect(at(0).introVisible.value).toBe(false);
    expect(at(0).note.value).toBe('First explanation');
    expect(at(40).note.value).toBe('Second explanation');
    expect(at(65).note.value).toBeNull();
    expect(at(65).introVisible.value).toBe(false);
    expect(at(95).noteFrame.value).toBe(90);
    expect(at(10).note.value).toBe('First explanation');
    expect(at(-1).introVisible.value).toBe(true);
  });

  it('can release introductory copy before any annotation', () => {
    const state = resolveEvents(
      [{ frame: 20, action: 'clearAnnotation' }],
      30,
      initialImageDetailState(),
      imageDetailReducer,
    );
    expect(state.introVisible.value).toBe(false);
    expect(state.note.value).toBeNull();
  });

  it('preserves a saved image in full by default and requires an explicit crop choice', () => {
    const props = { assetRequirement: { type: 'image', subject: 'Leaf cross-section' } };
    expect(imageDetailSchema.parse(props).imageFit).toBe('contain');
    expect(imageDetailSchema.parse({ ...props, imageFit: 'cover' }).imageFit).toBe('cover');
    expect(imageDetailSchema.safeParse({ ...props, imageFit: 'auto-detect' }).success).toBe(false);
  });
});
