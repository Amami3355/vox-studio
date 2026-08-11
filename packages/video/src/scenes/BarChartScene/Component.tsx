import type React from 'react';
import { useCurrentFrame } from 'remotion';
import { aggregateBeyond } from '../../core/aggregate';
import { resolveEvents } from '../../core/events';
import type { SceneProps } from '../../core/types';
import type { MotionProfile } from '../../design/motion';
import { emphasisColor } from '../../design/theme';
import {
  Backdrop,
  BarGroup,
  Callout,
  CameraRig,
  EmptyState,
  SceneTitle,
  SlotFrame,
  useEntrance,
  useSpace,
} from '../../primitives';
import { barChartConstraints } from './constraints';
import type { BarChartLayoutId } from './layouts';
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
  const frame = useCurrentFrame();
  const columnGap = useSpace(5);
  const annotationGap = useSpace(4);
  const variant = (layout as BarChartLayoutId) ?? 'standard';

  const data = aggregateBeyond(props.data, barChartConstraints.data?.recommendedMax ?? 8, 'Others');

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
    <Backdrop>
      <CameraRig profile={profile} durationInFrames={durationInFrames}>
        <SlotFrame safeArea={safeArea}>
          <Header title={props.title} accent={primary} profile={profile} />

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
            chart
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
        </SlotFrame>
      </CameraRig>
    </Backdrop>
  );
};

/** Accent rule plus headline. The rule is what stops the title floating in the void. */
const Header: React.FC<{
  title: string;
  accent: string;
  profile: MotionProfile;
}> = ({ title, accent, profile }) => {
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
      <SceneTitle startFrame={2} profile={profile}>
        {title}
      </SceneTitle>
    </div>
  );
};
