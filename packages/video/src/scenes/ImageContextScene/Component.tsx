import type React from 'react';
import { Img, staticFile, useCurrentFrame } from 'remotion';
import { ASSET_REQUIREMENT_FIELD } from '../../core/assets';
import { resolveEvents } from '../../core/events';
import type { SceneProps } from '../../core/types';
import { staggerFrames } from '../../design/motion';
import { imageOverlay } from '../../design/theme';
import {
  AnimatedText,
  Backdrop,
  CameraRig,
  Reveal,
  SlotFrame,
  TITLE_LINE_HEIGHT,
  TITLE_MAX_WIDTH,
  TextScrim,
  useFrameBox,
  useSpace,
  useTitleStep,
} from '../../primitives';
import { imageContextGeometry } from './layouts';
import type { ImageContextProps } from './schema';
import { imageContextReducer, initialImageContextState } from './state';

/** SlotFrame owns the allocated region. The camera moves only the media layer,
 * leaving reading positions stable throughout the shot. */
export const ImageContextScene: React.FC<SceneProps<ImageContextProps>> = (input) => {
  const { props, assets, events, safeArea, profile, durationInFrames } = input;
  const state = resolveEvents(
    events,
    useCurrentFrame(),
    initialImageContextState(events),
    imageContextReducer,
  );
  const asset = assets[ASSET_REQUIREMENT_FIELD];
  const imageFrame = state.imageFrame.value;
  return (
    <Backdrop>
      <SlotFrame
        safeArea={safeArea}
        bleed={
          <div style={{ position: 'absolute', inset: 0, backgroundColor: imageOverlay.ground }}>
            {imageFrame !== null && asset?.status === 'ready' ? (
              <CameraRig profile={profile} durationInFrames={durationInFrames}>
                <Reveal
                  startFrame={imageFrame}
                  profile={profile}
                  direction="right"
                  style={{ position: 'absolute', inset: 0 }}
                >
                  <Img
                    src={/^[a-z][a-z0-9+.-]*:/i.test(asset.uri) ? asset.uri : staticFile(asset.uri)}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      objectPosition: props.imageFocus,
                      display: 'block',
                    }}
                  />
                </Reveal>
              </CameraRig>
            ) : null}
          </div>
        }
      >
        <Message
          {...input}
          copyFrame={state.copyFrame.value}
          emphasis={imageFrame === null ? null : state.emphasis.value}
          emphasisFrame={state.emphasis.since}
          placeholder={imageFrame !== null && asset?.status !== 'ready'}
        />
      </SlotFrame>
    </Backdrop>
  );
};

const Message: React.FC<
  SceneProps<ImageContextProps> & {
    copyFrame: number | null;
    emphasis: string | null;
    emphasisFrame: number;
    placeholder: boolean;
  }
> = ({ props, profile, theme, layout, copyFrame, emphasis, emphasisFrame, placeholder }) => {
  const box = useFrameBox();
  const gap = useSpace(3);
  const narrow = box.width / box.height < imageContextGeometry.narrowBelowAspect;
  const right = layout === 'bottomRight' || layout === 'splitLeft';
  const width =
    box.width *
    (narrow
      ? 1
      : layout === 'lowerThird'
        ? imageContextGeometry.bandShare
        : imageContextGeometry.columnShare);
  const fallback =
    placeholder && !props.headline && !props.caption ? props.assetRequirement.subject : '';
  const headline = emphasis ?? (copyFrame === null ? '' : props.headline || fallback);
  const caption = emphasis || copyFrame === null ? '' : props.caption;
  const start = emphasis ? emphasisFrame : (copyFrame ?? 0);
  const step = useTitleStep(headline, width, {
    ceiling: imageOverlay.titleStep,
    maxHeight: box.height * imageContextGeometry.titleHeightShare,
  });

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: right ? 'flex-end' : 'flex-start',
      }}
    >
      {headline || caption ? (
        <TextScrim width={width} align={right ? 'right' : 'left'}>
          <div
            data-scene-foreground="copy"
            style={{ display: 'flex', flexDirection: 'column', gap, minWidth: 0 }}
          >
            {headline ? (
              <AnimatedText
                startFrame={start}
                profile={profile}
                font="display"
                step={step}
                weight={theme.type.weight.bold}
                tracking={theme.type.tracking.tight}
                lineHeight={TITLE_LINE_HEIGHT}
                maxWidth={`${TITLE_MAX_WIDTH * 100}%`}
                color={imageOverlay.ink}
                style={{ textWrap: 'balance' }}
              >
                {headline}
              </AnimatedText>
            ) : null}
            {caption ? (
              <AnimatedText
                startFrame={start + (headline ? staggerFrames(profile) : 0)}
                profile={profile}
                step={imageOverlay.captionStep}
                lineHeight={imageOverlay.captionLineHeight}
                maxWidth={`${TITLE_MAX_WIDTH * 100}%`}
                color={imageOverlay.secondaryInk}
              >
                {caption}
              </AnimatedText>
            ) : null}
          </div>
        </TextScrim>
      ) : null}
    </div>
  );
};
