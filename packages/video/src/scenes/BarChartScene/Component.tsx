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
  titleStep,
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
   * How many categories this box can carry at full size.
   *
   * On the full canvas that is the published soft constraint and nothing else — the
   * catalog says 8, and a scene that quietly kept 6 would make the manifest a lie. A
   * composed box asks the same question of its own height, and the answer feeds the
   * degradation the capability already declares rather than a new one: the weakest values
   * collapse into `Others`, exactly as they do past the soft limit.
   *
   * Vertical columns are bounded by width rather than height and are not capped here: at
   * `maxWidth: 200` per column, eight of them ask for 1600px and a half frame gives 537,
   * so they simply get narrower — legible, and the frame the shipped slice already plays.
   */
  const recommendedMax = barChartConstraints.data?.recommendedMax ?? 8;
  const capacity =
    composed && variant === 'horizontal'
      ? Math.max(
          barChartGeometry.minCategories,
          Math.floor((box.height * barChartGeometry.chartShare) / rowPitch),
        )
      : recommendedMax;

  const data = aggregateBeyond(props.data, Math.min(recommendedMax, capacity), 'Others');

  const state = resolveEvents(
    events,
    frame,
    initialBarChartState(data.length, profile, events, props.highlight ?? null),
    makeBarChartReducer(profile),
  );

  const primary = emphasisColor(theme, props.emphasis);
  const annotation = state.annotation.value;
  const isEmpty = data.length === 0;

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
    />
  );

  return (
    <>
      <Header title={props.title} accent={primary} profile={profile} composed={composed} />

      {isEmpty ? (
        <EmptyState startFrame={6} profile={profile} />
      ) : variant === 'withCallout' ? (
        <div style={{ flex: 1, display: 'flex', gap: columnGap, minHeight: 0 }}>
          <div style={{ flex: 62, display: 'flex', minWidth: 0 }}>{chart}</div>
          <div
            style={{
              flex: 34,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              minWidth: 0,
            }}
          >
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
  /** In a portrait box the title labels the chart; it does not declaim over it. */
  composed: boolean;
}> = ({ title, accent, profile, composed }) => {
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
      <SceneTitle
        startFrame={2}
        profile={profile}
        step={composed ? Math.max(2, titleStep(title.length) - 1) : undefined}
      >
        {title}
      </SceneTitle>
    </div>
  );
};
