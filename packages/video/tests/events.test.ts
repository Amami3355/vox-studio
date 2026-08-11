import { describe, expect, it } from 'vitest';
import { resolveEvents } from '../src/core/events';
import type { TimedEvent } from '../src/core/types';

type State = { count: number; label: string | null };

const reducer = (state: State, event: TimedEvent): State => {
  if (event.action === 'inc') return { ...state, count: state.count + 1 };
  if (event.action === 'label') return { ...state, label: String(event.payload?.value) };
  return state;
};

const initial: State = { count: 0, label: null };

describe('resolveEvents', () => {
  it('applies only events at or before the frame', () => {
    const events: TimedEvent[] = [
      { frame: 10, action: 'inc' },
      { frame: 20, action: 'inc' },
      { frame: 30, action: 'inc' },
    ];
    expect(resolveEvents(events, 0, initial, reducer).count.value).toBe(0);
    expect(resolveEvents(events, 10, initial, reducer).count.value).toBe(1);
    expect(resolveEvents(events, 25, initial, reducer).count.value).toBe(2);
    expect(resolveEvents(events, 999, initial, reducer).count.value).toBe(3);
  });

  it('reports the frame each field last changed, which is what lets a spring start', () => {
    const events: TimedEvent[] = [
      { frame: 12, action: 'inc' },
      { frame: 40, action: 'label', payload: { value: 'London' } },
      { frame: 70, action: 'inc' },
    ];
    const at50 = resolveEvents(events, 50, initial, reducer);
    expect(at50.count.since).toBe(12);
    expect(at50.label.since).toBe(40);
    expect(at50.label.value).toBe('London');

    const at80 = resolveEvents(events, 80, initial, reducer);
    expect(at80.count.since).toBe(70);
    expect(at80.label.since).toBe(40);
  });

  it('marks untouched fields so the initial value is distinguishable from an event', () => {
    const at5 = resolveEvents([{ frame: 10, action: 'inc' }], 5, initial, reducer);
    expect(at5.count.touched).toBe(false);
    expect(at5.count.since).toBe(0);
  });

  it('is order independent: unsorted events fold identically', () => {
    const shuffled: TimedEvent[] = [
      { frame: 30, action: 'inc' },
      { frame: 10, action: 'inc' },
      { frame: 20, action: 'inc' },
    ];
    expect(resolveEvents(shuffled, 25, initial, reducer).count.value).toBe(2);
  });

  it('is pure: rendering frame N never depends on having rendered N-1', () => {
    const events: TimedEvent[] = [
      { frame: 5, action: 'inc' },
      { frame: 15, action: 'inc' },
    ];
    const direct = resolveEvents(events, 20, initial, reducer);
    for (let f = 0; f < 20; f++) resolveEvents(events, f, initial, reducer);
    const afterSweep = resolveEvents(events, 20, initial, reducer);
    expect(afterSweep).toEqual(direct);
  });
});
