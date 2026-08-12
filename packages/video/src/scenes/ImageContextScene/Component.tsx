import type React from 'react';
import { Img } from 'remotion';
import { ASSET_REQUIREMENT_FIELD } from '../../core/assets';
import type { AssetRef, SceneProps } from '../../core/types';
import { type MotionProfile, staggerFrames } from '../../design/motion';
import { type Theme, scaleStep } from '../../design/theme';
import {
  AnimatedText,
  Backdrop,
  CameraRig,
  Eyebrow,
  Reveal,
  SceneTitle,
  SlotFrame,
  useFrameBox,
  useSpace,
} from '../../primitives';
import { splitLeftGeometry } from './layouts';
import type { ImageContextProps } from './schema';

/**
 * The image half is the composition; the copy half supports it. Everything visual comes
 * from L0/L1 — this file adds no colour, easing or duration of its own.
 *
 * "Half" is a proportion, not a side. Given half the canvas by the compiler the same three
 * slots stack instead of sitting side by side, because two columns inside 960px leave the
 * copy narrower than its own words — the exact frame ADR-0003 called "squeezed, silently
 * and legally". Which arrangement is drawn comes from the shape of the box, never from the
 * slot: see `layouts.ts`.
 *
 * It never throws over a missing asset: `SceneRenderer` is where a capability that
 * requires assets fails loudly, so by the time a frame is being drawn the only honest
 * behaviour left is to degrade into the subject plate.
 */
export const ImageContextScene: React.FC<SceneProps<ImageContextProps>> = ({
  props,
  assets,
  safeArea,
  theme,
  profile,
  durationInFrames,
}) => {
  const asset = assets[ASSET_REQUIREMENT_FIELD];

  return (
    <Backdrop>
      <CameraRig profile={profile} durationInFrames={durationInFrames}>
        <SlotFrame safeArea={safeArea} padded={false}>
          <SplitLayout
            headline={props.headline}
            caption={props.caption}
            subject={props.assetRequirement.subject}
            asset={asset}
            profile={profile}
            theme={theme}
          />
        </SlotFrame>
      </CameraRig>
    </Backdrop>
  );
};

const SplitLayout: React.FC<{
  headline: string;
  caption: string;
  subject: string;
  asset: AssetRef | undefined;
  profile: MotionProfile;
  theme: Theme;
}> = ({ headline, caption, subject, asset, profile, theme }) => {
  const outer = useSpace(5);
  const gap = useSpace(5);
  const copyGap = useSpace(3);
  const stagger = staggerFrames(profile);

  const box = useFrameBox();
  const stacked = box.width / box.height < splitLeftGeometry.stackBelowAspect;

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        ...(stacked
          ? {
              gridTemplateRows: `${splitLeftGeometry.imageRows}fr ${splitLeftGeometry.copyRows}fr`,
            }
          : {
              gridTemplateColumns: `${splitLeftGeometry.imageColumns}fr ${splitLeftGeometry.copyColumns}fr`,
            }),
        gap,
        padding: outer,
      }}
    >
      {/* The wipe follows the split: across the frame when the plate is a column, up out
          of the copy when it is a band above it. */}
      <Reveal
        startFrame={0}
        profile={profile}
        direction={stacked ? 'up' : 'right'}
        style={{
          minWidth: 0,
          minHeight: 0,
          borderRadius: theme.radius[3],
          overflow: 'hidden',
        }}
      >
        <AssetPlate asset={asset} subject={subject} theme={theme} />
      </Reveal>

      <div
        style={{
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: copyGap,
        }}
      >
        <Eyebrow startFrame={stagger} profile={profile}>
          Visual context
        </Eyebrow>
        {headline ? (
          <SceneTitle startFrame={stagger * 2} profile={profile}>
            {headline}
          </SceneTitle>
        ) : null}
        {caption ? (
          <AnimatedText
            startFrame={stagger * 3}
            profile={profile}
            step={1}
            color={theme.color.inkMuted}
          >
            {caption}
          </AnimatedText>
        ) : null}
      </div>
    </div>
  );
};

/**
 * `placeholder` and `failed` render identically on purpose. The distinction is
 * operational — one needs patience, the other needs intervention — and it is carried by
 * the `AssetRef` into the compile report, not by making the video look broken.
 */
const AssetPlate: React.FC<{
  asset: AssetRef | undefined;
  subject: string;
  theme: Theme;
}> = ({ asset, subject, theme }) => {
  if (asset?.status === 'ready') {
    return (
      <Img
        src={asset.uri}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    );
  }

  const subjectSize = scaleStep(theme.type.scale, 2);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'flex-end',
        padding: theme.space[5],
        backgroundColor: theme.color.surface,
      }}
    >
      <div
        style={{
          color: theme.color.ink,
          fontFamily: theme.type.display,
          fontSize: subjectSize,
          fontWeight: theme.type.weight.bold,
          letterSpacing: `${theme.type.tracking.tight * subjectSize}px`,
        }}
      >
        {subject}
      </div>
    </div>
  );
};
