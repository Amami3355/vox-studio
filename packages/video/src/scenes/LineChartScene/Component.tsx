import type React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { resolveEvents } from '../../core/events';
import type { SceneProps } from '../../core/types';
import { type MotionProfile, springConfig, staggerFrames } from '../../design/motion';
import {
  Backdrop,
  CameraRig,
  EmptyState,
  LinePlot,
  MAX_HEADER_SHARE,
  SceneTitle,
  SlotFrame,
  useFrameBox,
  useSpace,
  useTheme,
  useTitleFit,
} from '../../primitives';
import { lineChartGeometry } from './layouts';
import type { LineChartProps } from './schema';
import { initialLineChartState, lineChartReducer } from './state';

export const LineChartScene: React.FC<SceneProps<LineChartProps>> = ({
  props,
  events,
  safeArea,
  profile,
  durationInFrames,
}) => (
  <Backdrop>
    <CameraRig profile={profile} durationInFrames={durationInFrames}>
      <SlotFrame safeArea={safeArea}>
        <LineChartFrame props={props} events={events} profile={profile} />
      </SlotFrame>
    </CameraRig>
  </Backdrop>
);

const LineChartFrame: React.FC<{
  props: LineChartProps;
  events: SceneProps<LineChartProps>['events'];
  profile: MotionProfile;
}> = ({ props, events, profile }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const box = useFrameBox();
  const gap = useSpace(3);
  const bottomGap = useSpace(4);
  const titleBottom = useSpace(lineChartGeometry.titleBottomSpace);
  const state = resolveEvents(
    events,
    frame,
    initialLineChartState(events, props.focus),
    lineChartReducer,
  );

  const isEmpty = props.points.length === 0;
  const revealFrame = state.revealFrame.value;
  const progressFor = (start: number | null): number => {
    if (start === null || frame < start) return 0;
    return spring({ frame: frame - start, fps, config: springConfig(profile) });
  };
  const revealProgress = props.series.map((_, index) =>
    progressFor(revealFrame === null ? null : revealFrame + staggerFrames(profile) * index),
  );
  const focus = state.focus.value;
  const focusSeriesIndex = focus
    ? props.series.findIndex((entry) => entry.label === focus.series)
    : -1;
  const focusReveal = focusSeriesIndex >= 0 ? (revealProgress[focusSeriesIndex] ?? 0) : 0;
  const focusProgress = focus ? Math.min(progressFor(focus.since), focusReveal) : 0;
  const annotation = state.annotation.value;
  const annotationSeriesIndex = annotation
    ? props.series.findIndex((entry) => entry.label === annotation.series)
    : -1;
  const annotationReveal =
    annotationSeriesIndex >= 0 ? (revealProgress[annotationSeriesIndex] ?? 0) : 0;
  const annotationProgress = annotation
    ? Math.min(progressFor(annotation.since), annotationReveal)
    : 0;

  const titleFit = useTitleFit(
    props.title,
    box.width,
    lineChartGeometry.titleMaxStep,
    box.height * MAX_HEADER_SHARE,
  );
  /** A stable allocation from the same measured fit that `SceneTitle` renders. */
  const headerHeight = Math.ceil(
    lineChartGeometry.accentRuleHeight + gap + titleFit.height + titleBottom,
  );
  const plotHeight = Math.max(1, box.height - headerHeight - bottomGap);

  return (
    <>
      <div style={{ height: headerHeight, display: 'flex', flexDirection: 'column', gap }}>
        <div
          style={{
            width: 96 * Math.min(1, progressFor(0)),
            height: lineChartGeometry.accentRuleHeight,
            flex: '0 0 auto',
            borderRadius: theme.radius[1],
            background: theme.color.accent,
          }}
        />
        <SceneTitle startFrame={2} profile={profile} maxStep={lineChartGeometry.titleMaxStep}>
          {props.title}
        </SceneTitle>
      </div>

      {isEmpty ? (
        <EmptyState message="No trend data available" startFrame={6} profile={profile} />
      ) : (
        <LinePlot
          width={box.width}
          height={plotHeight}
          points={props.points}
          series={props.series}
          unit={props.unit}
          baseline={props.baseline}
          chromeProgress={progressFor(6)}
          revealProgress={revealProgress}
          focus={focus}
          focusProgress={focusProgress}
          annotation={annotation}
          annotationProgress={annotationProgress}
        />
      )}
    </>
  );
};
