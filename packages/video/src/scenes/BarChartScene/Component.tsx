import type React from 'react';
import { useCurrentFrame } from 'remotion';
import { aggregateBeyond } from '../../core/aggregate';
import { resolveEvents } from '../../core/events';
import type { SceneProps } from '../../core/types';
import type { MotionProfile } from '../../design/motion';
import { type Theme, emphasisColor } from '../../design/theme';
import {
  AccentRule,
  Backdrop,
  BarGroup,
  Callout,
  CameraRig,
  EmptyState,
  SceneTitle,
  SlotFrame,
  composedStepCeiling,
  useEntrance,
  useFrameBox,
  useSpace,
} from '../../primitives';
import { barChartConstraints } from './constraints';
import { type BarChartLayoutId, barChartCapacity, barChartGeometry, isComposed } from './layouts';
import type { BarChartProps } from './schema';
import { initialBarChartState, makeBarChartReducer } from './state';

/**
 * Pure function of (props, frame). No state, no randomness, no clock.
 *
 * Everything time-dependent flows from `useCurrentFrame` and the event fold, which is
 * what lets Remotion render frame 400 on one machine and frame 12 on another.
 */
export const BarChartScene: React.FC<SceneProps<BarChartProps>> = ({
  props,
  layout,
  events,
  safeArea,
  theme,
  profile,
  durationInFrames,
}) => {
  return (
    <Backdrop>
      <CameraRig profile={profile} durationInFrames={durationInFrames}>
        <SlotFrame safeArea={safeArea}>
          <ChartFrame
            props={props}
            layout={layout}
            events={events}
            theme={theme}
            profile={profile}
          />
        </SlotFrame>
      </CameraRig>
    </Backdrop>
  );
};

/**
 * Everything that depends on the box the scene was actually given, which is why it is a
 * child: `useFrameBox` reads what `SlotFrame` provides, and `SlotFrame` is mounted above.
 *
 * The event fold lives here too, because the fold is seeded with `data.length` and the
 * category count is now one of the things the box decides.
 */
const ChartFrame: React.FC<{
  props: BarChartProps;
  layout?: string;
  events: SceneProps<BarChartProps>['events'];
  theme: Theme;
  profile: MotionProfile;
}> = ({ props, layout, events, theme, profile }) => {
  const frame = useCurrentFrame();
  const columnGap = useSpace(5);
  const annotationGap = useSpace(4);
  const variant = (layout as BarChartLayoutId) ?? 'standard';

  const box = useFrameBox();
  const composed = isComposed(box);

  /**
   * How many categories this box can carry at full size.
   *
   * On the full canvas that is the published soft constraint and nothing else — the
   * catalog says 8, and a scene that quietly kept 6 would make the manifest a lie. A
   * composed box asks the same question of its own shape, and the answer feeds the
   * degradation the capability already declares rather than a new one: the weakest values
   * collapse, exactly as they do past the soft limit.
   *
   * The arithmetic lives beside the layout geometry in `layouts.ts`, so a test can ask the
   * question the same way this line does and the published answer cannot drift from it.
   */
  const recommendedMax = barChartConstraints.data?.recommendedMax ?? 8;
  const capacity = barChartCapacity({ box, variant, theme, recommendedMax });

  const { series: data } = aggregateBeyond(props.data, Math.min(recommendedMax, capacity), {
    valueKind: props.valueKind,
  });

  const state = resolveEvents(
    events,
    frame,
    initialBarChartState(data.length, profile, events, props.highlight ?? null),
    makeBarChartReducer(profile),
  );

  const primary = emphasisColor(theme, props.emphasis);
  const annotation = state.annotation.value;
  const isEmpty = data.length === 0;

  /**
   * How far the annotation column is open, 0 → 1, on the annotation's own entrance.
   *
   * `Infinity` and not `0` for the untouched case: `resolveEvents` reports `since: 0` for a
   * field no event has reached yet, and a spring started at frame 0 is already open at
   * frame 0 — the column would spend the scene open and empty, which is the defect this
   * replaces. `touched` is the only field that distinguishes "annotated at the top of the
   * scene" from "never annotated".
   */
  const annotationEntrance = useEntrance(
    state.annotation.touched ? state.annotation.since : Number.POSITIVE_INFINITY,
    profile,
  );
  const open = Math.min(1, annotationEntrance);

  /**
   * The width the column settles at, in canvas px, computed from the box rather than left
   * to flex. The transition needs a fixed target on both ends: an animated `flexBasis`
   * resolves against the row, and the row is what is changing.
   */
  const { calloutColumns, chartColumns } = barChartGeometry;
  const calloutWidth = Math.max(
    0,
    ((box.width - columnGap) * calloutColumns) / (chartColumns + calloutColumns),
  );

  /**
   * The width the plot itself gets, which is the box less whatever the callout column is
   * currently holding. Multiplied by `open` for the same reason `calloutWidth` is: the
   * column grows on the annotation's own entrance, and a label cut against a column that
   * is not there yet would be cut twice as short for the whole scene before it.
   */
  const plotWidth =
    variant === 'withCallout'
      ? Math.max(0, box.width - (calloutWidth + columnGap) * open)
      : box.width;

  /**
   * In a portrait box the title labels the chart rather than declaiming over it.
   *
   * A ceiling and not the answer: it says this frame should not shout, and `SceneTitle`
   * still fits whatever it is given to the column underneath. The header spans the whole
   * box and declares no column of its own, so the width it fits against is the frame box —
   * which is exactly what `useColumnWidth` falls back to.
   */
  const titleCeiling = composed
    ? composedStepCeiling(props.title.length, barChartGeometry.composedStepDrop)
    : undefined;

  const chart = (
    <BarGroup
      data={data}
      revealFrames={state.revealFrames.value}
      highlighted={state.highlighted.value}
      highlightSince={state.highlighted.touched ? state.highlighted.since : 0}
      primary={primary}
      unit={props.unit}
      profile={profile}
      orientation={variant === 'horizontal' ? 'horizontal' : 'vertical'}
      gridlines={props.gridlines}
      width={plotWidth}
    />
  );

  return (
    <>
      <Header title={props.title} accent={primary} profile={profile} maxStep={titleCeiling} />

      {isEmpty ? (
        <EmptyState startFrame={6} profile={profile} />
      ) : variant === 'withCallout' ? (
        <div style={{ flex: 1, display: 'flex', gap: columnGap * open, minHeight: 0 }}>
          <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>{chart}</div>
          {/*
           * The column is a width, not a slot: it grows from nothing on the annotation's
           * own entrance, so the chart holds the whole row until there is something to
           * yield to. `flexBasis` and not `flex`, because a share of the row is only
           * meaningful once the row has two occupants.
           */}
          <div
            style={{
              flexGrow: 0,
              flexShrink: 0,
              flexBasis: calloutWidth * open,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            {/*
             * Fixed at its settled width and clipped by the column, rather than laid out
             * inside it. A callout sized by a box that is still opening re-wraps its own
             * text on every frame of the transition, which reads as a glitch and not as a
             * reveal — the text has to be set once and then uncovered.
             */}
            <div style={{ width: calloutWidth }}>
              {annotation ? (
                <Callout
                  text={annotation.text}
                  label={annotation.label}
                  startFrame={state.annotation.since}
                  profile={profile}
                  accent={theme.color.accentAlt}
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        /* `minHeight: 0` so the chart is sized by what the header left it, rather than
           by its own rows — a flex child defaults to `min-height: auto` and pushes past
           the frame instead of yielding to it. */
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>{chart}</div>
      )}

      {variant !== 'withCallout' && annotation ? (
        <div style={{ marginTop: annotationGap }}>
          <Callout
            text={annotation.text}
            label={annotation.label}
            startFrame={state.annotation.since}
            profile={profile}
            accent={theme.color.accentAlt}
          />
        </div>
      ) : null}
    </>
  );
};

/** Accent rule plus headline. The rule is what stops the title floating in the void. */
const Header: React.FC<{
  title: string;
  accent: string;
  profile: MotionProfile;
  /** Ceiling only; `SceneTitle` does the fitting. Undefined on the full canvas. */
  maxStep?: number;
}> = ({ title, accent, profile, maxStep }) => {
  const gap = useSpace(3);
  const bottom = useSpace(5);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap, marginBottom: bottom }}>
      <AccentRule accent={accent} profile={profile} />
      <SceneTitle startFrame={2} profile={profile} maxStep={maxStep}>
        {title}
      </SceneTitle>
    </div>
  );
};
