import type React from 'react';
import { useCurrentFrame } from 'remotion';
import { resolveEvents } from '../../core/events';
import type { SceneProps } from '../../core/types';
import {
  AnimatedText,
  Backdrop,
  CameraRig,
  ColumnProvider,
  EmptyState,
  ProcessPath,
  SceneTitle,
  SlotFrame,
  useFrameBox,
  useSpace,
} from '../../primitives';
import type { ProcessStepsProps } from './schema';
import { initialProcessStepsState, processStepsReducer } from './state';
export const ProcessStepsScene: React.FC<SceneProps<ProcessStepsProps>> = (input) => (
  <Backdrop>
    <CameraRig profile={input.profile} durationInFrames={input.durationInFrames}>
      <SlotFrame safeArea={input.safeArea}>
        <Process {...input} />
      </SlotFrame>
    </CameraRig>
  </Backdrop>
);
const Process: React.FC<SceneProps<ProcessStepsProps>> = ({ props, events, profile, theme }) => {
  const state = resolveEvents(
    events,
    useCurrentFrame(),
    initialProcessStepsState(events),
    processStepsReducer,
  );
  const active = Math.min(state.active.value, props.steps.length - 1);
  const step = props.steps[active];
  const box = useFrameBox();
  const gap = useSpace(4);
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap,
      }}
    >
      <ColumnProvider width={box.width}>
        {props.headline ? (
          <AnimatedText startFrame={0} profile={profile} step={1} color={theme.color.inkMuted}>
            {props.headline}
          </AnimatedText>
        ) : null}
        {props.steps.length === 0 ? (
          <EmptyState message="No stages established" startFrame={0} profile={profile} />
        ) : (
          <ProcessPath
            count={props.steps.length}
            active={active}
            startFrame={state.stageFrame.value}
          />
        )}
        {step ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap }}>
            <SceneTitle startFrame={state.stageFrame.value} profile={profile}>
              {step.label}
            </SceneTitle>
            {step.detail ? (
              <AnimatedText startFrame={state.stageFrame.value} profile={profile} step={1}>
                {step.detail}
              </AnimatedText>
            ) : null}
          </div>
        ) : null}
      </ColumnProvider>
    </div>
  );
};
