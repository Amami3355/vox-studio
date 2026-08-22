/**
 * What `timeline` refuses, and what it does with what it accepts.
 *
 * Every refusal below is a **published contract** — `checks.ts` and `schema.ts` state rules
 * the agent is taught, and a test that pins one is pinning something an author will read.
 * None of them pins a DOM structure, which the next layout will move.
 *
 * All of them are judged on **written order** rather than on resolved frames, per ADR-0011,
 * so they fail at `validate` — before a take exists and before anyone has paid to record
 * one.
 */
import { describe, expect, it } from 'vitest';
import { validateScene } from '../src/catalog/validate';
import { resolveEvents } from '../src/core/events';
import type { SceneInstance } from '../src/core/types';
import { timelineSchema } from '../src/scenes/TimelineScene';
import { initialTimelineState, timelineReducer } from '../src/scenes/TimelineScene/state';

const canonicalProps = {
  title: 'The Berlin rent cap, start to finish',
  events: [
    { date: '2019-06-18', label: 'The Senate votes a cap' },
    { date: '2020-02-23', label: 'The cap takes effect' },
    { date: '2021-04-15', label: 'Karlsruhe strikes the law down' },
  ],
  periods: [{ label: 'Cap in force', from: '2020-02-23', to: '2021-04-15' }],
};

const scene = (overrides: Partial<SceneInstance> = {}): SceneInstance => ({
  id: 'chronology',
  component: 'timeline',
  layout: 'spine',
  motionProfile: 'editorialStatic',
  spansBeats: ['b1'],
  props: canonicalProps,
  events: [],
  ...overrides,
});

const messages = (instance: SceneInstance): string[] =>
  validateScene(instance).errors.map((error) => error.message);

describe('timeline schema', () => {
  it('accepts the canonical chronology and defaults its periods', () => {
    expect(timelineSchema.parse(canonicalProps).periods).toHaveLength(1);
    expect(
      timelineSchema.parse({ title: 'No period', events: canonicalProps.events }).periods,
    ).toEqual([]);
  });

  it('accepts the empty chronology, which is the only shape with no events', () => {
    expect(timelineSchema.parse({ title: 'Nothing dated', events: [] }).events).toEqual([]);
  });

  it('refuses a period with no chronology to mark', () => {
    const report = timelineSchema.safeParse({
      title: 'Nothing dated',
      events: [],
      periods: canonicalProps.periods,
    });
    expect(report.success).toBe(false);
  });

  /**
   * ADR-0011's own history is the argument. The runtime *does* sort events by frame, and
   * that sort is exactly what turned an out-of-order list into a silent defect instead of a
   * visible one. A chronology that quietly reordered its dates would repeat that one level
   * up, and the author would never learn they had written it wrong.
   */
  it('refuses events out of date order rather than sorting them into something unauthored', () => {
    const report = timelineSchema.safeParse({
      ...canonicalProps,
      periods: [],
      events: [
        { date: '2020-02-23', label: 'The cap takes effect' },
        { date: '2019-06-18', label: 'The Senate votes a cap' },
      ],
    });

    expect(report.success).toBe(false);
    expect(report.error?.issues[0]?.message).toMatch(/never sorted for you/);
  });

  it('refuses two events on one day, because the axis gives them one position', () => {
    const report = timelineSchema.safeParse({
      title: 'Same day',
      events: [
        { date: '2020-02-23', label: 'The cap takes effect' },
        { date: '2020-02-23', label: 'The first rent is cut' },
      ],
    });

    expect(report.success).toBe(false);
    expect(report.error?.issues[0]?.message).toMatch(/one label that carries both/);
  });

  /** Two identical labels is `AMBIGUOUS_ANCHOR`'s shape: a reference that picks one silently. */
  it('refuses a duplicate event label, because an action names a label', () => {
    const report = timelineSchema.safeParse({
      title: 'Twice over',
      events: [
        { date: '2020-01-01', label: 'The ruling' },
        { date: '2020-06-01', label: 'The ruling' },
      ],
    });

    expect(report.success).toBe(false);
    expect(report.error?.issues[0]?.message).toMatch(/Duplicate event label/);
  });

  it('refuses a period that ends before it starts', () => {
    const report = timelineSchema.safeParse({
      ...canonicalProps,
      periods: [{ label: 'Backwards', from: '2021-04-15', to: '2020-02-23' }],
    });

    expect(report.success).toBe(false);
    expect(report.error?.issues[0]?.message).toMatch(/ends before it starts/);
  });

  it('refuses a date that is not a real calendar date', () => {
    expect(
      timelineSchema.safeParse({
        title: 'Not a day',
        events: [{ date: '2021-02-30', label: 'Nowhere' }],
      }).success,
    ).toBe(false);
  });

  /** A period may sit outside the events; the axis widens for it. See `timelineAxis`. */
  it('accepts a period that opens before the first event and closes after the last', () => {
    expect(
      timelineSchema.safeParse({
        ...canonicalProps,
        periods: [{ label: 'Housing emergency', from: '2018-05-01', to: '2022-09-30' }],
      }).success,
    ).toBe(true);
  });
});

describe('timeline referential checks', () => {
  it('accepts a well-formed instance', () => {
    expect(validateScene(scene()).ok).toBe(true);
  });

  it('refuses a focus on a moment the chronology does not carry, and lists the ones it does', () => {
    const report = validateScene(
      scene({
        events: [
          { at: 'b1.start', action: 'revealTimeline' },
          { at: 'b1.word:Karlsruhe', action: 'focusEvent', payload: { label: 'The appeal' } },
        ],
      }),
    );

    const error = report.errors.find((one) => one.code === 'INVALID_PAYLOAD');
    expect(error?.message).toMatch(/would target no moment/);
    expect(error?.expected).toEqual(canonicalProps.events.map((event) => event.label));
  });

  it('refuses an annotation on a moment the chronology does not carry', () => {
    expect(
      messages(
        scene({
          events: [
            { at: 'b1.start', action: 'revealTimeline' },
            {
              at: 'b1.end',
              action: 'annotate',
              payload: { label: 'The appeal', text: 'Rents rebounded overnight' },
            },
          ],
        }),
      ).some((message) => message.includes('would target no moment')),
    ).toBe(true);
  });

  it('refuses an emphasis written before the reveal that mounts the chronology', () => {
    const report = validateScene(
      scene({
        events: [
          {
            at: 'b1.word:Karlsruhe',
            action: 'focusEvent',
            payload: { label: 'The cap takes effect' },
          },
          { at: 'b1.end', action: 'revealTimeline' },
        ],
      }),
    );

    const error = report.errors.find((one) => one.code === 'EVENT_BEFORE_ELEMENT_REVEALED');
    expect(error?.message).toMatch(/still held back/);
    expect(error?.expected).toEqual(['b1.end']);
  });

  /**
   * The "renders fine, means something else" case, and the only reason it is an error
   * rather than a warning: the frame would be correct and a dimension the author wrote
   * would simply be missing from it, with nothing downstream ever saying so.
   */
  it('refuses a second thread, because the layout that draws one would drop it in silence', () => {
    const report = validateScene(
      scene({
        props: {
          title: 'Two threads',
          events: [
            { date: '2019-06-18', label: 'The Senate votes', track: 'Policy' },
            { date: '2019-09-04', label: 'Listings fall', track: 'Market' },
          ],
          periods: [],
        },
      }),
    );

    expect(report.ok).toBe(false);
    expect(report.errors[0]?.message).toMatch(/carries 2/);
  });

  it('leaves a single named thread alone, since one thread is what the layout draws', () => {
    expect(
      validateScene(
        scene({
          props: {
            title: 'One thread, named',
            events: [
              { date: '2019-06-18', label: 'The Senate votes', track: 'Policy' },
              { date: '2020-02-23', label: 'The cap takes effect', track: 'Policy' },
            ],
            periods: [],
          },
        }),
      ).ok,
    ).toBe(true);
  });
});

describe('timeline state', () => {
  /**
   * The trap `docs/adding-a-capability.md` names: `resolveEvents`' `since` reports 0 for a
   * field no event reached, which is indistinguishable from a reveal anchored at the top of
   * the scene. The reveal frame is stored inside the state so the two can be told apart.
   */
  it('holds the chronology back until its reveal, and starts open without one', () => {
    const held = resolveEvents(
      [{ frame: 40, action: 'revealTimeline' }],
      20,
      initialTimelineState([{ frame: 40, action: 'revealTimeline' }]),
      timelineReducer,
    );
    expect(held.revealFrame.value).toBeNull();

    const open = resolveEvents([], 0, initialTimelineState([]), timelineReducer);
    expect(open.revealFrame.value).toBe(0);
  });

  it('records the frame a focus and an annotation landed on', () => {
    const events = [
      { frame: 10, action: 'revealTimeline' },
      { frame: 42, action: 'focusEvent', payload: { label: 'The cap takes effect' } },
      {
        frame: 90,
        action: 'annotate',
        payload: { label: 'The cap takes effect', text: 'Rents rebounded overnight' },
      },
    ];
    const state = resolveEvents(events, 120, initialTimelineState(events), timelineReducer);

    expect(state.revealFrame.value).toBe(10);
    expect(state.focus.value).toEqual({ label: 'The cap takes effect', since: 42 });
    expect(state.annotation.value?.since).toBe(90);
  });

  /** An annotation stays up once it arrives, so a viewer can finish reading it. */
  it('keeps an annotation after a later focus moves on', () => {
    const events = [
      { frame: 10, action: 'revealTimeline' },
      {
        frame: 40,
        action: 'annotate',
        payload: { label: 'The cap takes effect', text: 'Rents rebounded overnight' },
      },
      { frame: 80, action: 'focusEvent', payload: { label: 'Karlsruhe strikes the law down' } },
    ];
    const state = resolveEvents(events, 200, initialTimelineState(events), timelineReducer);

    expect(state.annotation.value?.label).toBe('The cap takes effect');
    expect(state.focus.value?.label).toBe('Karlsruhe strikes the law down');
  });
});
