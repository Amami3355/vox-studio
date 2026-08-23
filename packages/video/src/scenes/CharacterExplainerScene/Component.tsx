import type React from 'react';
import { Img, staticFile, useCurrentFrame } from 'remotion';
import { ASSET_REQUIREMENT_FIELD } from '../../core/assets';
import { resolveEvents } from '../../core/events';
import type { AssetRef, SceneProps } from '../../core/types';
import { type MotionProfile, motion, staggerFrames } from '../../design/motion';
import { type Theme, mix, scaleStep } from '../../design/theme';
import {
  AnimatedText,
  Backdrop,
  CameraRig,
  ColumnProvider,
  EmptyState,
  Eyebrow,
  Reveal,
  SceneTitle,
  SlotFrame,
  useEntrance,
  useFrameBox,
  useSpace,
} from '../../primitives';
import { sideBySideGeometry } from './layouts';
import type { CharacterExplainerProps } from './schema';
import { characterExplainerReducer, initialCharacterExplainerState } from './state';

/**
 * The shell every scene shares, in order: `Backdrop` → `CameraRig` → `SlotFrame` → the
 * layout. Everything visual comes from L0/L1 — this file adds no colour of its own, and
 * every duration it moves to is read off the motion tokens rather than invented, so the
 * motion profile can still pace the scene.
 *
 * It never throws over a missing asset: `SceneRenderer` is where a capability that
 * requires assets fails loudly, so by the time a frame is being drawn the only honest
 * behaviour left is to degrade into the subject plate.
 *
 * This first increment declares only the full composition, so the layout is drawn for
 * one shape of box. If a composed form is ever designed, it reads the shape from
 * `useFrameBox()` — the component is told the box it got, never the slot the compiler
 * chose (ADR-0003 decision 4).
 */
export const CharacterExplainerScene: React.FC<SceneProps<CharacterExplainerProps>> = ({
  props,
  assets,
  events,
  safeArea,
  theme,
  profile,
  durationInFrames,
}) => {
  const asset = assets[ASSET_REQUIREMENT_FIELD];

  return (
    <Backdrop>
      <CameraRig profile={profile} durationInFrames={durationInFrames}>
        <SlotFrame safeArea={safeArea}>
          <SideBySideLayout
            label={props.label}
            headline={props.headline}
            explanation={props.explanation}
            subject={props.assetRequirement.subject}
            asset={asset}
            events={events}
            profile={profile}
            theme={theme}
          />
        </SlotFrame>
      </CameraRig>
    </Backdrop>
  );
};

const SideBySideLayout: React.FC<{
  label: string;
  headline: string;
  explanation: string;
  subject: string;
  asset: AssetRef | undefined;
  events: SceneProps<CharacterExplainerProps>['events'];
  profile: MotionProfile;
  theme: Theme;
}> = ({ label, headline, explanation, subject, asset, events, profile, theme }) => {
  const outer = useSpace(5);
  const gap = useSpace(5);
  const copyGap = useSpace(3);
  const stagger = staggerFrames(profile);

  /**
   * The fold. Every frame below is read off it rather than written here, which is what
   * lets a plan hold either half back until the narration reaches it. `null` on a frame
   * means the plan drove that reveal and it has not landed yet — an empty half is the
   * plan's choice, not a defect. With no events at all both are 0 and this renders as if
   * the reducer did not exist.
   */
  const frame = useCurrentFrame();
  const state = resolveEvents(
    events,
    frame,
    initialCharacterExplainerState(events),
    characterExplainerReducer,
  );
  const characterFrame = state.characterFrame.value;
  const copyFrame = state.copyFrame.value;
  const accentFrame = state.accentFrame.value;

  const box = useFrameBox();
  const { characterColumns, copyColumns } = sideBySideGeometry;
  const inner = Math.max(0, box.width - outer * 2);
  const characterWidth = ((inner - gap) * characterColumns) / (characterColumns + copyColumns);
  const copyWidth = ((inner - gap) * copyColumns) / (characterColumns + copyColumns);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: `${characterColumns}fr ${copyColumns}fr`,
        gap,
        padding: outer,
      }}
    >
      {/* An empty cell while `characterFrame` is null. The grid keeps its shape, so the
          copy does not jump sideways when the figure arrives — the plan asked for a held
          frame, not for a different layout. */}
      <div style={{ position: 'relative', minWidth: 0, minHeight: 0 }}>
        {characterFrame === null ? null : (
          <CutoutFigure
            asset={asset}
            subject={subject}
            startFrame={characterFrame}
            accentFrame={accentFrame}
            profile={profile}
            theme={theme}
            width={characterWidth}
            height={Math.max(0, box.height - outer * 2)}
          />
        )}
      </div>

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
        {/* The stagger is unchanged; only its origin moves. At `copyFrame` 0 — every
            instance that carries no `revealCopy` — these are the same frames the scene
            has always used. */}
        {copyFrame === null ? null : (
          <ColumnProvider width={copyWidth}>
            {label ? (
              <Eyebrow startFrame={copyFrame + stagger} profile={profile}>
                {label}
              </Eyebrow>
            ) : null}
            {headline ? (
              <SceneTitle startFrame={copyFrame + stagger * 2} profile={profile}>
                {headline}
              </SceneTitle>
            ) : null}
            {explanation ? (
              <AnimatedText
                startFrame={copyFrame + stagger * 3}
                profile={profile}
                step={1}
                color={theme.color.inkMuted}
              >
                {explanation}
              </AnimatedText>
            ) : null}
            {/* Empty headline and explanation together are a designed state, not a
                failure: the character stands beside a pending note rather than an
                accidental blank column. */}
            {!headline && !explanation ? (
              <EmptyState message="Explanation pending" startFrame={copyFrame} profile={profile} />
            ) : null}
          </ColumnProvider>
        )}
      </div>
    </div>
  );
};

/**
 * The character half: one contained cutout given restrained graphic life — a bounded
 * entrance, subtle ambient drift, and a reversible accent — plus the halo and ground
 * shadow that make the figure sit on the scene's ground rather than float above it.
 *
 * Everything moves the whole cutout as one graphic object. Nothing here animates anatomy,
 * and every amount spent is a fraction of the containment allowance `layouts.ts`
 * budgets, so the silhouette cannot be carried to the live-frame edge.
 */
const CutoutFigure: React.FC<{
  asset: AssetRef | undefined;
  subject: string;
  startFrame: number;
  accentFrame: number | null;
  profile: MotionProfile;
  theme: Theme;
  width: number;
  height: number;
}> = ({ asset, subject, startFrame, accentFrame, profile, theme, width, height }) => {
  const frame = useCurrentFrame();
  const entrance = useEntrance(startFrame, profile);

  const allowance = Math.min(width, height) * sideBySideGeometry.motionAllowance;

  /**
   * Ambient drift, phased on the scene's own clock rather than on the entrance. Two
   * instances of the same scene — one eventless, one whose reveals have landed — then
   * settle on the *same* frame, which is the relation the render suite holds; phasing
   * on the entrance would leave them a drift apart forever. The amplitude ramps with
   * the entrance, so the figure is still while it arrives and lives once it has.
   */
  const cycle = motion.duration.slow * 8;
  const live = Math.min(1, entrance);
  const phase = (frame / cycle) * Math.PI * 2;
  const ambientAmplitude = allowance * sideBySideGeometry.ambientShare;
  const ambientX = Math.sin(phase) * ambientAmplitude * live;
  const ambientY = Math.cos(phase) * ambientAmplitude * 0.5 * live;
  const ambientTilt = Math.sin(phase + 1) * sideBySideGeometry.ambientTiltDegrees * live;

  /**
   * The accent envelope: a single raised cosine over a window read off the motion
   * tokens, so the gesture is as brief as the profile's own durations and returns to
   * exactly zero — no residual scale, tilt or halo survives it. A later accent restarts
   * the window by overwriting the frame, and before the first accent lands there is
   * nothing to ease.
   */
  const accentWindow = motion.duration.base * 2;
  const accentElapsed = accentFrame === null ? -1 : frame - accentFrame;
  const accent =
    accentElapsed >= 0 && accentElapsed <= accentWindow
      ? Math.sin((accentElapsed / accentWindow) * Math.PI)
      : 0;
  const accentScale = sideBySideGeometry.motionAllowance * sideBySideGeometry.accentShare;
  const tilt = ambientTilt + sideBySideGeometry.accentTiltDegrees * accent;

  const enterScale = 0.94 + 0.06 * entrance;

  return (
    <Reveal
      startFrame={startFrame}
      profile={profile}
      direction="up"
      style={{ position: 'absolute', inset: 0 }}
    >
      {/* The halo: theme roles only, receded toward the ground so it stays subordinate
          to the explanation, brightening briefly with the accent. */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '45%',
          width: Math.min(width, height) * (0.7 + 0.08 * accent),
          height: Math.min(width, height) * (0.7 + 0.08 * accent),
          borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          background: `radial-gradient(circle, ${mix(theme.color.accent, theme.color.bg, 0.55)} 0%, ${mix(
            theme.color.accent,
            theme.color.bg,
            0.8,
          )} 45%, transparent 70%)`,
          opacity: 0.5 * live + 0.3 * accent,
        }}
      />
      {/* The ground the figure stands on. In ink receded toward the ground, so it reads
          as a shadow on the set rather than a second accent. */}
      <div
        style={{
          position: 'absolute',
          bottom: allowance * 0.2,
          left: '50%',
          width: width * 0.5,
          height: allowance * 0.25,
          borderRadius: '50%',
          transform: 'translateX(-50%)',
          background: `radial-gradient(ellipse, ${mix(theme.color.ink, theme.color.bg, 0.7)} 0%, transparent 70%)`,
          opacity: 0.5 * live,
        }}
      />
      {/* The cutout itself, inside the containment allowance and transformed as one
          object. The pivot sits near the feet so a tilt reads as a stance shifting
          rather than a picture swinging. */}
      <div style={{ position: 'absolute', inset: allowance }}>
        <div
          style={{
            width: '100%',
            height: '100%',
            transform: `scale(${enterScale * (1 + accentScale * accent)}) translate(${ambientX}px, ${ambientY}px) rotate(${tilt}deg)`,
            transformOrigin: '50% 85%',
          }}
        >
          <Figure asset={asset} subject={subject} theme={theme} />
        </div>
      </div>
    </Reveal>
  );
};

/**
 * `placeholder` and `failed` render identically on purpose. The distinction is
 * operational — one needs patience, the other needs intervention — and it is carried by
 * the `AssetRef` into the compile report, not by making the video look broken. The plate
 * shows the requested subject, never an invented figure.
 */
const Figure: React.FC<{ asset: AssetRef | undefined; subject: string; theme: Theme }> = ({
  asset,
  subject,
  theme,
}) => {
  if (asset?.status === 'ready') {
    return (
      <Img
        src={readySrc(asset.uri)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          objectPosition: 'center bottom',
          display: 'block',
        }}
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
        borderRadius: theme.radius[3],
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          color: theme.color.ink,
          fontFamily: theme.type.display,
          fontSize: subjectSize,
          fontWeight: theme.type.weight.bold,
          letterSpacing: `${theme.type.tracking.tight * subjectSize}px`,
          minWidth: 0,
          overflowWrap: 'break-word',
        }}
      >
        {subject}
      </div>
    </div>
  );
};

/**
 * A ready reference arrives in one of two territories, and only one of them needs help
 * to meet an `<Img>`. An inline `data:` URI is its own src. A public-relative path is
 * meaningful wherever the resolver ran — in tests, or in the compiler — but the static
 * base that makes it servable exists only inside the renderer, so `staticFile` is
 * applied here, at the draw site, exactly where `CompiledVideo` applies it to the
 * voice-over. A scheme prefix names the other territories; a bare path names a file.
 */
const readySrc = (uri: string): string =>
  /^[a-z][a-z0-9+.-]*:/i.test(uri) ? uri : staticFile(uri);
