import { describe, expect, it } from 'vitest';
import { validateScene } from '../src/catalog/tools';
import type { VideoPlan } from '../src/catalog/validate';
import { compile } from '../src/compile';
import { resolveEvents } from '../src/core/events';
import type { SceneInstance, TimedBeat } from '../src/core/types';
import { imageFramingAt } from '../src/primitives/ImageViewport';
import { imageDetailReducer, initialImageDetailState } from '../src/scenes/ImageDetailScene/state';
import {
  initialProcessStepsState,
  processStepsReducer,
} from '../src/scenes/ProcessStepsScene/state';

const beats: TimedBeat[] = [
  {
    id: 'b1',
    text: 'Water enters, changes, then leaves.',
    fromMs: 0,
    toMs: 7000,
    words: [
      { text: 'Water', fromMs: 0 },
      { text: 'enters', fromMs: 900 },
      { text: 'changes', fromMs: 2800 },
      { text: 'then', fromMs: 4300 },
      { text: 'leaves', fromMs: 5000 },
    ],
  },
];
const process: SceneInstance = {
  id: 'process',
  component: 'process_steps',
  spansBeats: ['b1'],
  props: {
    headline: 'A transformation',
    steps: [{ label: 'Intake' }, { label: 'Change' }, { label: 'Output' }],
  },
  events: [
    { at: 'b1.word:enters', action: 'advance' },
    { at: 'b1.word:changes', action: 'advance' },
    { at: 'b1.word:leaves', action: 'advance' },
  ],
};
const image: SceneInstance = {
  id: 'image',
  component: 'image_detail',
  spansBeats: ['b1'],
  props: {
    headline: '',
    assetRequirement: {
      type: 'image',
      subject: 'A plant',
      treatment: 'illustration',
      orientation: 'landscape',
    },
  },
  events: [
    { at: 'b1.word:enters', action: 'focus', payload: { region: 'bottom' } },
    { at: 'b1.word:changes', action: 'annotate', payload: { text: 'A change of state' } },
    { at: 'b1.word:leaves', action: 'clearAnnotation' },
    { at: 'b1.word:leaves', action: 'focus', payload: { region: 'whole' } },
  ],
};
const planFor = (scene: SceneInstance): VideoPlan => ({
  beats: beats.map(({ id, text }) => ({ id, text })),
  sections: [{ id: 'explanation', spansBeats: ['b1'], scenes: [scene] }],
});

describe('word-driven visual explanation', () => {
  it('advances actual rendered state on compiled word onsets within one unchanged Beat', () => {
    const result = compile({ plan: planFor(process), beats });
    expect(result.report.errors).toEqual([]);
    const events = result.document?.sections[0]?.scenes[0]?.events ?? [];
    expect(events.map((e) => e.frame)).toEqual([27, 84, 150]);
    const state = (frame: number) =>
      resolveEvents(events, frame, initialProcessStepsState(events), processStepsReducer);
    expect(state(26).active.value).toBe(-1);
    expect(state(27).active.value).toBe(0);
    expect(state(84).active.value).toBe(1);
    expect(state(150).active.value).toBe(2);
    expect(state(84).stageFrame.value).toBe(84);
  });
  it('reframes and clears annotations without altering the Take or inventing timestamps', () => {
    const result = compile({ plan: planFor(image), beats });
    expect(result.report.errors).toEqual([]);
    const events = result.document?.sections[0]?.scenes[0]?.events ?? [];
    const state = (frame: number) =>
      resolveEvents(events, frame, initialImageDetailState(), imageDetailReducer);
    expect(state(83).note.value).toBeNull();
    expect(state(84).note.value).toBe('A change of state');
    expect(state(150).note.value).toBeNull();
    expect(imageFramingAt(state(83).focuses.value, 83)).toEqual({ scale: 1.65, x: 50, y: 100 });
    expect(imageFramingAt(state(180).focuses.value, 180)).toEqual({ scale: 1, x: 50, y: 50 });
  });
  it('keeps an interrupted focus continuous at the new anchor', () => {
    const first = { frame: 20, region: 'bottom' as const };
    const second = { frame: 25, region: 'top' as const };
    expect(imageFramingAt([first, second], 25)).toEqual(imageFramingAt([first], 25));
    expect(imageFramingAt([first, second], 60)).toEqual({ scale: 1.65, x: 50, y: 0 });
  });
  it('rejects advancing beyond available content and repeated framing that changes nothing', () => {
    expect(
      validateScene({
        ...process,
        events: [...(process.events ?? []), { at: 'scene.end-short', action: 'advance' }],
      }).errors,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'EVENT_EXCEEDS_CONTENT' })]));
    expect(
      validateScene({
        ...image,
        events: [{ at: 'b1.start', action: 'focus', payload: { region: 'whole' } }],
      }).errors,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EVENT_CONTENT_MISMATCH' })]),
    );
  });
});
