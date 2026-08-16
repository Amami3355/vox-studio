import type React from 'react';
import { useCurrentFrame } from 'remotion';
import { resolveEvents } from '../../core/events';
import type { SceneProps } from '../../core/types';
import type { MotionProfile } from '../../design/motion';
import { staggerFrames } from '../../design/motion';
import type { Theme } from '../../design/theme';
import {
  AnimatedText,
  Backdrop,
  CameraRig,
  ColumnProvider,
  EmptyState,
  Eyebrow,
  SceneTitle,
  SlotFrame,
  useFrameBox,
  useSpace,
  useTitleStep,
  useTypeSize,
} from '../../primitives';
import { centeredGeometry } from './layouts';
import type { QuoteSceneProps } from './schema';
import { initialQuoteSceneState, quoteReducer } from './state';

/**
 * The shell every scene shares, in order: `Backdrop` → `CameraRig` → `SlotFrame` → the
 * layout. Everything visual comes from L0/L1 — this file adds no colour, easing or
 * duration of its own, because a scene that invents a duration is a scene the motion
 * profile can no longer pace.
 *
 * The frame is typography and nothing else: an eyebrow, an oversized mark drawn from the
 * type scale, the quote fitted to its column, and the attribution beneath. There is no
 * camera by default — `editorialStatic` sets `camera: none`, which is the honest choice
 * for a sentence that has to hold on its own.
 *
 * It never throws over a missing asset: `SceneRenderer` is where a capability that
 * requires assets fails loudly, so by the time a frame is being drawn the only honest
 * behaviour left is to degrade.
 */
export const QuoteScene: React.FC<SceneProps<QuoteSceneProps>> = ({
  props,
  events,
  safeArea,
  profile,
  theme,
  durationInFrames,
}) => (
  <Backdrop>
    <CameraRig profile={profile} durationInFrames={durationInFrames}>
      <SlotFrame safeArea={safeArea}>
        <QuoteFrame
          quote={props.quote}
          attribution={props.attribution}
          role={props.role}
          eyebrow={props.eyebrow}
          events={events}
          profile={profile}
          theme={theme}
        />
      </SlotFrame>
    </CameraRig>
  </Backdrop>
);

const QuoteFrame: React.FC<{
  quote: string;
  attribution: string;
  role: string;
  eyebrow: string;
  events: SceneProps<QuoteSceneProps>['events'];
  profile: SceneProps<QuoteSceneProps>['profile'];
  theme: Theme;
}> = ({ quote, attribution, role, eyebrow, events, profile, theme }) => {
  const gap = useSpace(3);
  const stagger = staggerFrames(profile);
  const box = useFrameBox();
  const columnWidth = box.width * centeredGeometry.columnRatio;

  /**
   * The fold. Every frame below is read off it rather than written here, which is what
   * lets a plan hold the quote back until the narration hands over to it.
   *
   * `quoteFrame === null` means the plan drove the reveal and it has not landed yet, so
   * only the eyebrow is on the frame — an empty quote column is the plan's choice, not a
   * defect. With no events at all it is 0 and this renders exactly as if the reducer did
   * not exist.
   */
  const frame = useCurrentFrame();
  const state = resolveEvents(events, frame, initialQuoteSceneState(events), quoteReducer);
  const quoteFrame = state.quoteFrame.value;
  const revealed = quoteFrame !== null;
  const start = quoteFrame ?? 0;

  /**
   * The mark stays one scale step louder than the quote's fitted step, so it reads as
   * the same statement scaled up rather than as a foreign glyph — but never louder than
   * the theme's top step. A quote at the top of the scale gets a mark at the same size,
   * which is the proportion an oversized pull-quote mark actually uses.
   *
   * No ceiling is passed to `useTitleStep`: the length ladder in `titleFit.ts` is what
   * keeps a paragraph from becoming a wall of 168px type. The fit guards the widest
   * *word* (a string wraps, a word does not), so a ceiling by itself would let a long
   * quote render at the top of the scale across a dozen lines and overflow the frame —
   * the exact failure the safe-area quiet border exists to catch. Length is the lever
   * that keeps a quote a quote.
   */
  const quoteStep = useTitleStep(quote, columnWidth);
  const markStep = Math.min(centeredGeometry.markStep, quoteStep + 1);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* The real binding is the block width; the provider only publishes it to the fit.
          Without the div, `SceneTitle`'s 86% maxWidth would resolve against the whole
          frame box and the quote would render wider than the column it was fitted to. */}
      <div style={{ width: columnWidth, display: 'flex', flexDirection: 'column', gap }}>
        <ColumnProvider width={columnWidth}>
          {/* The eyebrow is outside every other branch on purpose: it is what the frame
              stands on while the plan holds the quote back, and an empty quote does not
              take it away. Only what the gate covers waits for the gate. */}
          {eyebrow ? (
            <Eyebrow startFrame={0} profile={profile}>
              {eyebrow}
            </Eyebrow>
          ) : null}
          {revealed ? (
            quote === '' ? (
              /* The empty state is a reveal like any other: it lands when the plan says
                 the quote lands, never at frame 0 ahead of its own gate. */
              <EmptyState message="Quote pending" startFrame={start} profile={profile} />
            ) : (
              <>
                <AnimatedText
                  startFrame={start + stagger}
                  profile={profile}
                  font="display"
                  step={markStep}
                  weight={theme.type.weight.bold}
                  color={theme.color.accent}
                  lineHeight={centeredGeometry.markLineHeight}
                >
                  {'\u201C'}
                </AnimatedText>
                <SceneTitle startFrame={start + stagger * 2} profile={profile}>
                  {quote}
                </SceneTitle>
                {attribution || role ? (
                  <Attribution
                    attribution={attribution}
                    role={role}
                    startFrame={start + stagger * 3}
                    profile={profile}
                    theme={theme}
                  />
                ) : null}
              </>
            )
          ) : null}
        </ColumnProvider>
      </div>
    </div>
  );
};

/**
 * Name in ink, role in muted — read as one signature rather than two labels, which is why
 * it is one `AnimatedText` and not two. The composition has four entrances (eyebrow →
 * mark → quote → attribution); a fifth for the role would be a beat nothing asked for,
 * and it would make the signature arrive in pieces.
 *
 * The role is a nested block rather than its own primitive so it enters on the same clip.
 * It carries its own size, weight and colour; tracking comes from the block, which is the
 * price of the single entrance and is not visible at this size difference.
 */
const Attribution: React.FC<{
  attribution: string;
  role: string;
  startFrame: number;
  profile: MotionProfile;
  theme: Theme;
}> = ({ attribution, role, startFrame, profile, theme }) => {
  const roleSize = useTypeSize(0);
  const gap = useSpace(1);

  return (
    <AnimatedText
      startFrame={startFrame}
      profile={profile}
      font="body"
      step={1}
      weight={theme.type.weight.medium}
      color={theme.color.ink}
    >
      {attribution}
      {role ? (
        <span
          style={{
            display: 'block',
            marginTop: attribution ? gap : 0,
            fontSize: roleSize,
            fontWeight: theme.type.weight.regular,
            color: theme.color.inkMuted,
          }}
        >
          {role}
        </span>
      ) : null}
    </AnimatedText>
  );
};
