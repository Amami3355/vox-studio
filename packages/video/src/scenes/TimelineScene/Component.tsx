import type React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { resolveEvents } from '../../core/events';
import type { SceneProps } from '../../core/types';
import { type MotionProfile, springConfig, staggerFrames } from '../../design/motion';
import {
  ACCENT_RULE_HEIGHT,
  AccentRule,
  Backdrop,
  CameraRig,
  EmptyState,
  MAX_HEADER_SHARE,
  SceneTitle,
  SlotFrame,
  TimelineSpine,
  useFrameBox,
  useSpace,
  useTheme,
  useTitleFit,
} from '../../primitives';
import { timelineGeometry } from './layouts';
import type { TimelineProps } from './schema';
import { initialTimelineState, timelineReducer } from './state';

/**
 * Pure function of (props, frame). No state, no randomness, no clock — everything
 * time-dependent flows from `useCurrentFrame` and the event fold, which is what lets
 * Remotion render frame 400 on one machine and frame 12 on another.
 */
export const TimelineScene: React.FC<SceneProps<TimelineProps>> = ({
  props,
  events,
  safeArea,
  profile,
  durationInFrames,
}) => (
  <Backdrop>
    <CameraRig profile={profile} durationInFrames={durationInFrames}>
      <SlotFrame safeArea={safeArea}>
        <TimelineFrame props={props} events={events} profile={profile} />
      </SlotFrame>
    </CameraRig>
  </Backdrop>
);

/**
 * Everything that depends on the box the scene was actually given.
 *
 * There is no `switch` on the layout here yet, and that is not an omission: `spine` is the
 * only arrangement `layouts.ts` declares, and `catalog/validate.ts` refuses an instance
 * naming any other. The branch arrives with `ledger`, which is the point of shipping one
 * layout first.
 */
const TimelineFrame: React.FC<{
  props: TimelineProps;
  events: SceneProps<TimelineProps>['events'];
  profile: MotionProfile;
}> = ({ props, events, profile }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const box = useFrameBox();
  const gap = useSpace(3);
  const bottomGap = useSpace(4);
  const titleBottom = useSpace(timelineGeometry.titleBottomSpace);
  const state = resolveEvents(events, frame, initialTimelineState(events), timelineReducer);

  const isEmpty = props.events.length === 0;
  const revealFrame = state.revealFrame.value;
  const progressFor = (start: number | null): number => {
    if (start === null || frame < start) return 0;
    return spring({ frame: frame - start, fps, config: springConfig(profile) });
  };

  /**
   * Staggered in **date order**, which is authored order — the schema refuses anything
   * else, so the index is the chronology's own sequence and no sort is needed here.
   */
  const revealProgress = props.events.map((_, index) =>
    progressFor(revealFrame === null ? null : revealFrame + staggerFrames(profile) * index),
  );

  const focus = state.focus.value;
  const focusIndex = focus ? props.events.findIndex((event) => event.label === focus.label) : -1;
  /** A focus can never be more present than the event it points at. */
  const focusProgress =
    focus && focusIndex >= 0
      ? Math.min(progressFor(focus.since), revealProgress[focusIndex] ?? 0)
      : 0;

  const annotation = state.annotation.value;
  const annotationIndex = annotation
    ? props.events.findIndex((event) => event.label === annotation.label)
    : -1;
  const annotationProgress =
    annotation && annotationIndex >= 0
      ? Math.min(progressFor(annotation.since), revealProgress[annotationIndex] ?? 0)
      : 0;

  const titleFit = useTitleFit(props.title, box.width, {
    ceiling: timelineGeometry.titleMaxStep,
    maxHeight: box.height * MAX_HEADER_SHARE,
  });
  /** A stable allocation from the same measured fit that `SceneTitle` renders. */
  const headerHeight = Math.ceil(ACCENT_RULE_HEIGHT + gap + titleFit.height + titleBottom);
  const plotHeight = Math.max(1, box.height - headerHeight - bottomGap);

  return (
    <>
      <div style={{ height: headerHeight, display: 'flex', flexDirection: 'column', gap }}>
        <AccentRule accent={theme.color.accent} profile={profile} />
        <SceneTitle startFrame={2} profile={profile} maxStep={timelineGeometry.titleMaxStep}>
          {props.title}
        </SceneTitle>
      </div>

      {isEmpty ? (
        <EmptyState message="No dated events available" startFrame={6} profile={profile} />
      ) : (
        <TimelineSpine
          width={box.width}
          height={plotHeight}
          events={props.events}
          periods={props.periods}
          geometry={timelineGeometry}
          chromeProgress={progressFor(6)}
          revealProgress={revealProgress}
          focus={focus}
          focusProgress={focusProgress}
          annotation={annotation}
          annotationProgress={annotationProgress}
          profile={profile}
          annotationStartFrame={annotation?.since ?? 0}
        />
      )}
    </>
  );
};
