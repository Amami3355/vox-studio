import type React from 'react';
import { Img, useCurrentFrame } from 'remotion';
import { ASSET_REQUIREMENT_FIELD } from '../../core/assets';
import { resolveEvents } from '../../core/events';
import type { AssetRef, SceneProps } from '../../core/types';
import { type MotionProfile, staggerFrames } from '../../design/motion';
import { type Theme, scaleStep } from '../../design/theme';
import {
  AnimatedText,
  Backdrop,
  CameraRig,
  ColumnProvider,
  Eyebrow,
  Reveal,
  SceneTitle,
  SlotFrame,
  Stamp,
  useFrameBox,
  useSpace,
} from '../../primitives';
import { splitLeftGeometry } from './layouts';
import type { ImageContextProps } from './schema';
import { imageContextReducer, initialImageContextState } from './state';

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
        <SlotFrame safeArea={safeArea} gridMargin={false}>
          <SplitLayout
            headline={props.headline}
            caption={props.caption}
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

const SplitLayout: React.FC<{
  headline: string;
  caption: string;
  subject: string;
  asset: AssetRef | undefined;
  events: SceneProps<ImageContextProps>['events'];
  profile: MotionProfile;
  theme: Theme;
}> = ({ headline, caption, subject, asset, events, profile, theme }) => {
  const outer = useSpace(5);
  const gap = useSpace(5);
  const copyGap = useSpace(3);
  const stampPad = useSpace(4);
  const stagger = staggerFrames(profile);

  /**
   * The fold. Every frame below is read off it rather than written here, which is what
   * lets a plan hold the plate back until the narration reaches its subject.
   *
   * `null` on either frame means the plan drove that reveal and it has not landed yet, so
   * the half stays off the frame entirely — an empty column is the plan's choice, not a
   * defect. With no events at all both are 0 and this renders exactly as it did before the
   * action vocabulary existed.
   */
  const frame = useCurrentFrame();
  const state = resolveEvents(events, frame, initialImageContextState(events), imageContextReducer);
  const imageFrame = state.imageFrame.value;
  const copyFrame = state.copyFrame.value;
  const emphasis = state.emphasis.value;

  const box = useFrameBox();
  const stacked = box.width / box.height < splitLeftGeometry.stackBelowAspect;

  /**
   * The width the copy actually gets, which is what the headline has to fit inside.
   *
   * Derived here rather than in the primitive because it is layout arithmetic, and this
   * layout owns it: the grid's own padding on both sides, then the gap, then the copy's
   * share of the split. Stacked, the copy spans the full inner width instead of a column —
   * the same reason the wipe changes direction.
   *
   * Declared to the subtree rather than applied to a component. Everything in the copy
   * column is bound by it, so the headline sizes itself and a caption added later inherits
   * the same fact without anyone remembering to wire it.
   */
  const { imageColumns, copyColumns, imageRows, copyRows } = splitLeftGeometry;
  const inner = Math.max(0, box.width - outer * 2);
  const copyWidth = stacked ? inner : ((inner - gap) * copyColumns) / (imageColumns + copyColumns);

  /**
   * The 5/12 the copy band is *owed* when stacked, in px, which is the floor of a row that
   * can grow rather than the whole of a row that cannot.
   *
   * The stack used to divide the height 7/5 outright, and a fixed share of a portrait box
   * is not a lot of room: at this schema's own ceiling — a 120-character headline over a
   * 240-character caption — the copy needed about a fifth more than it was given, and grid
   * children do not refuse. Each of the three shrank below its content and each clipped
   * under `AnimatedText`'s own `overflow: hidden`, 96px off the headline, 48 off the
   * caption and 7 off the fixed `Visual context` eyebrow — a label with no content of its
   * own, which is what proved the squeeze belonged to the column rather than to the copy.
   *
   * A plate can be any height and a paragraph cannot: text has an intrinsic size and an
   * image is happy with whatever is left. So the copy row is `minmax(owed, auto)` and the
   * plate takes the remainder — identical to the old 7/5 for any copy that fitted it, and
   * yielding rather than cutting for copy that does not.
   */
  const innerHeight = Math.max(0, box.height - outer * 2 - gap);
  const copyFloor = (innerHeight * copyRows) / (imageRows + copyRows);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        ...(stacked
          ? { gridTemplateRows: `minmax(0, 1fr) minmax(${copyFloor}px, auto)` }
          : { gridTemplateColumns: `${imageColumns}fr ${copyColumns}fr` }),
        gap,
        padding: outer,
      }}
    >
      {/* The wipe follows the split: across the frame when the plate is a column, up out
          of the copy when it is a band above it.

          An empty cell while `imageFrame` is null. The grid keeps its shape, so the copy
          does not jump sideways when the plate arrives — the plan asked for a held frame,
          not for a different layout. */}
      {imageFrame === null ? (
        <div style={{ minWidth: 0, minHeight: 0 }} />
      ) : (
        <Reveal
          startFrame={imageFrame}
          profile={profile}
          direction={stacked ? 'up' : 'right'}
          style={{
            minWidth: 0,
            minHeight: 0,
            borderRadius: theme.radius[3],
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <AssetPlate asset={asset} subject={subject} theme={theme} />
          {/* Top of the plate, because the placeholder's subject label sits at the bottom
              of it and the two would otherwise stack on the same corner. */}
          {emphasis ? (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                padding: stampPad,
                display: 'flex',
              }}
            >
              <Stamp text={emphasis} startFrame={state.emphasis.since} profile={profile} />
            </div>
          ) : null}
        </Reveal>
      )}

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
        {/* The stagger is unchanged; only its origin moved. At `copyFrame` 0 — every
            instance that carries no `revealCopy` — these are the same three frames the
            scene has always used. */}
        {copyFrame === null ? null : (
          <ColumnProvider width={copyWidth}>
            <Eyebrow startFrame={copyFrame + stagger} profile={profile}>
              Visual context
            </Eyebrow>
            {headline ? (
              <SceneTitle startFrame={copyFrame + stagger * 2} profile={profile}>
                {headline}
              </SceneTitle>
            ) : null}
            {caption ? (
              <AnimatedText
                startFrame={copyFrame + stagger * 3}
                profile={profile}
                step={1}
                color={theme.color.inkMuted}
              >
                {caption}
              </AnimatedText>
            ) : null}
          </ColumnProvider>
        )}
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
          /**
           * The plate clips — it is inside `Reveal` — and the subject is agent-written.
           *
           * `minWidth: 0` is the load-bearing half. A flex item's minimum size defaults to
           * its min-content width, which for an unbreakable word is the whole word, so it
           * simply overflowed the plate and `break-word` never got the chance to act.
           */
          minWidth: 0,
          overflowWrap: 'break-word',
        }}
      >
        {subject}
      </div>
    </div>
  );
};
