import type React from 'react';
import { useCurrentFrame } from 'remotion';
import { aggregateBeyond } from '../../core/aggregate';
import { resolveEvents } from '../../core/events';
import type { SceneProps } from '../../core/types';
import type { MotionProfile } from '../../design/motion';
import { type Theme, emphasisColor } from '../../design/theme';
import {
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
  useTypeSize,
} from '../../primitives';
import { barChartConstraints } from './constraints';
import { type BarChartLayoutId, barChartGeometry } from './layouts';
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
  const composed = box.width / box.height < barChartGeometry.composeBelowAspect;

  /**
   * What one horizontal row costs, from the same tokens `BarGroup` lays it out with: the
   * bar is `valueSize * 1.35` tall and the rows are separated by one `space[3]` gap. Read
   * through the density scale, so it already accounts for a squeezed scene.
   */
  const rowPitch = useTypeSize(1) * 1.35 + useSpace(3);

  /**
   * What one vertical column costs, on the same terms: the room its name needs, plus the
   * gap that separates it from the next. `BarGroup` lays the columns out with exactly
   * these two tokens.
   */
  const columnPitch = useTypeSize(0) * barChartGeometry.minLabelEms + useSpace(3);

  /**
   * How many categories this box can carry at full size.
   *
   * On the full canvas that is the published soft constraint and nothing else — the
   * catalog says 8, and a scene that quietly kept 6 would make the manifest a lie. A
   * composed box asks the same question of its own height, and the answer feeds the
   * degradation the capability already declares rather than a new one: the weakest values
   * collapse into `Others`, exactly as they do past the soft limit.
   *
   * Vertical columns ask the same question of the box's *width*, because that is the axis
   * they are laid out along. This used to exclude them by name — *"bounded by width rather
   * than height and not capped here: at `maxWidth: 200` per column, eight of them ask for
   * 1600px and a half frame gives 537, so they simply get narrower"* — which is true of the
   * bars and false of the names underneath them. The bars did get narrower. The labels did
   * not, and the content-stress suite drew the result: twenty categories at their
   * forty-character ceiling put the plot 592px into the half the compiler had reserved.
   * Nine columns in a 538px box is not nine narrow columns, it is a chart with no room to
   * say what it is counting.
   */
  const recommendedMax = barChartConstraints.data?.recommendedMax ?? 8;
  const capacity = !composed
    ? recommendedMax
    : Math.max(
        barChartGeometry.minCategories,
        variant === 'horizontal'
          ? Math.floor((box.height * barChartGeometry.chartShare) / rowPitch)
          : Math.floor((box.width * barChartGeometry.chartShare) / columnPitch),
      );

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
  const draw = useEntrance(0, profile);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap, marginBottom: bottom }}>
      <div
        style={{
          width: Math.round(96 * Math.min(1, draw)),
          height: 4,
          background: accent,
          borderRadius: 2,
        }}
      />
      <SceneTitle startFrame={2} profile={profile} maxStep={maxStep}>
        {title}
      </SceneTitle>
    </div>
  );
};
