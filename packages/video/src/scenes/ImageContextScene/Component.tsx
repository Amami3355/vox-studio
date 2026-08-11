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
  useSpace,
} from '../../primitives';
import { splitLeftGeometry } from './layouts';
import type { ImageContextProps } from './schema';

export const ImageContextScene: React.FC<SceneProps<ImageContextProps>> = ({
  props,
  assets,
  safeArea,
  theme,
  profile,
  durationInFrames,
}) => {
  const asset = assets[ASSET_REQUIREMENT_FIELD];
  if (!asset) {
    throw new Error(
      'ImageContextScene requires a resolved asset for "assetRequirement". Run the Asset Resolver before rendering.',
    );
  }

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
  asset: AssetRef;
  profile: MotionProfile;
  theme: Theme;
}> = ({ headline, caption, subject, asset, profile, theme }) => {
  const outer = useSpace(5);
  const gap = useSpace(5);
  const copyGap = useSpace(3);
  const stagger = staggerFrames(profile);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: `${splitLeftGeometry.imageColumns}fr ${splitLeftGeometry.copyColumns}fr`,
        gap,
        padding: outer,
      }}
    >
      <Reveal
        startFrame={0}
        profile={profile}
        direction="right"
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

const AssetPlate: React.FC<{
  asset: AssetRef;
  subject: string;
  theme: Theme;
}> = ({ asset, subject, theme }) => {
  if (asset.status === 'ready') {
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
