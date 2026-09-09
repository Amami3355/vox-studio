import type React from 'react';
import { useCurrentFrame } from 'remotion';
import { ASSET_REQUIREMENT_FIELD } from '../../core/assets';
import { resolveEvents } from '../../core/events';
import type { SceneProps } from '../../core/types';
import { staggerFrames } from '../../design/motion';
import { imageDetailType, imageOverlay } from '../../design/theme';
import {
  AnimatedText,
  Backdrop,
  ImageViewport,
  SlotFrame,
  TITLE_LINE_HEIGHT,
  TITLE_MAX_WIDTH,
  TextScrim,
  useFrameBox,
  useSpace,
  useTitleStep,
} from '../../primitives';
import { imageDetailGeometry } from './layouts';
import type { ImageDetailProps } from './schema';
import { imageDetailReducer, initialImageDetailState } from './state';

/** Only authored focus events move an explanatory image. An ambient camera would
 * crop the supposedly complete view and compete with its prepared reframing. */
export const ImageDetailScene: React.FC<SceneProps<ImageDetailProps>> = (input) => {
  const state = resolveEvents(
    input.events,
    useCurrentFrame(),
    initialImageDetailState(),
    imageDetailReducer,
  );
  const asset = input.assets[ASSET_REQUIREMENT_FIELD];
  return (
    <Backdrop>
      <SlotFrame
        safeArea={input.safeArea}
        bleed={
          <div style={{ position: 'absolute', inset: 0, backgroundColor: imageOverlay.ground }}>
            {asset?.status === 'ready' ? (
              <ImageViewport
                uri={asset.uri}
                changes={state.focuses.value}
                fit={input.props.imageFit}
              />
            ) : null}
          </div>
        }
      >
        <Explanation
          {...input}
          note={state.note.value}
          noteFrame={state.noteFrame.value}
          introVisible={state.introVisible.value}
          placeholder={asset?.status !== 'ready'}
        />
      </SlotFrame>
    </Backdrop>
  );
};

const Explanation: React.FC<
  SceneProps<ImageDetailProps> & {
    note: string | null;
    noteFrame: number;
    introVisible: boolean;
    placeholder: boolean;
  }
> = ({ props, theme, profile, note, noteFrame, introVisible, placeholder }) => {
  const box = useFrameBox();
  const gap = useSpace(2);
  const width = box.width * imageDetailGeometry.copyWidthShare;
  const fallback =
    placeholder && !props.headline && !props.caption ? props.assetRequirement.subject : '';
  const headline = note ?? (introVisible ? props.headline || fallback : '');
  const caption = introVisible && !note ? props.caption : '';
  const step = useTitleStep(headline, width, {
    ceiling: imageDetailType.titleStep,
    maxHeight: box.height * imageDetailGeometry.titleHeightShare,
  });
  const start = note ? noteFrame : 0;
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      {headline || caption ? (
        <TextScrim width={width} align="left">
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
                startFrame={headline ? staggerFrames(profile) : 0}
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
