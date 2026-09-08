import type React from 'react';
import { useCurrentFrame } from 'remotion';
import { resolveEvents } from '../../core/events';
import type { SceneProps } from '../../core/types';
import {
  AnimatedText,
  Backdrop,
  CameraRig,
  ColumnProvider,
  ImageViewport,
  SceneTitle,
  SlotFrame,
  Stamp,
  useFrameBox,
  useSpace,
} from '../../primitives';
import type { ImageDetailProps } from './schema';
import { imageDetailReducer, initialImageDetailState } from './state';
export const ImageDetailScene: React.FC<SceneProps<ImageDetailProps>> = (input) => (
  <Backdrop>
    <CameraRig profile={input.profile} durationInFrames={input.durationInFrames}>
      <SlotFrame safeArea={input.safeArea}>
        <Plate {...input} />
      </SlotFrame>
    </CameraRig>
  </Backdrop>
);
const Plate: React.FC<SceneProps<ImageDetailProps>> = ({
  props,
  events,
  assets,
  profile,
  theme,
}) => {
  const state = resolveEvents(
    events,
    useCurrentFrame(),
    initialImageDetailState(),
    imageDetailReducer,
  );
  const box = useFrameBox();
  const gap = useSpace(3);
  const asset = assets.assetRequirement;
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap }}>
      {props.headline ? (
        <ColumnProvider width={box.width}>
          <SceneTitle startFrame={0} profile={profile}>
            {props.headline}
          </SceneTitle>
        </ColumnProvider>
      ) : null}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: theme.color.surface,
          borderRadius: theme.radius[3],
        }}
      >
        {asset?.status === 'ready' ? (
          <ImageViewport uri={asset.uri} changes={state.focuses.value} />
        ) : (
          <div style={{ padding: gap, overflowWrap: 'anywhere' }}>
            <AnimatedText startFrame={0} profile={profile} step={1}>
              {props.assetRequirement.subject}
            </AnimatedText>
          </div>
        )}
        {state.note.value ? (
          <div style={{ position: 'absolute', bottom: gap, left: gap, right: gap }}>
            <Stamp
              text={state.note.value}
              startFrame={state.noteFrame.value}
              profile={profile}
              step={1}
            />
          </div>
        ) : null}
      </div>
      {props.caption ? (
        <AnimatedText startFrame={0} profile={profile} step={0} color={theme.color.inkMuted}>
          {props.caption}
        </AnimatedText>
      ) : null}
    </div>
  );
};
