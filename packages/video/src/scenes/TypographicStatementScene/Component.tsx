import type React from 'react';
import { Fragment, useMemo } from 'react';
import { useCurrentFrame } from 'remotion';
import { resolveEvents } from '../../core/events';
import type { SceneProps } from '../../core/types';
import { tokenise } from '../../core/words';
import type { MotionProfile } from '../../design/motion';
import { staggerFrames } from '../../design/motion';
import { type Theme, emphasisColor, mix } from '../../design/theme';
import {
  AnimatedText,
  Backdrop,
  CameraRig,
  ColumnProvider,
  EmptyState,
  Eyebrow,
  SlotFrame,
  TITLE_LINE_HEIGHT,
  TITLE_MAX_WIDTH,
  type TypeFace,
  useFrameBox,
  useSpace,
  useTitleStep,
  useTypeSize,
} from '../../primitives';
import { cutGeometry } from './layouts';
import type { TypographicStatementProps } from './schema';
import { initialTypographicStatementState, typographicStatementReducer } from './state';

/**
 * The shell every scene shares, in order: `Backdrop` → `CameraRig` → `SlotFrame` → the
 * layout. Everything visual comes from L0/L1 — this file adds no colour, easing or
 * duration of its own.
 *
 * The one thing it does that no other scene does is hand `Backdrop` a ground. That ground
 * is still not a colour this file chose: `emphasis` is a semantic role and `emphasisColor`
 * is the theme's own resolver, the same one `bar_chart` and `stat_counter` spend. What the
 * card adds is scale — the token that draws a 96 × 4 rule elsewhere is drawn edge to edge
 * here, so the brightness change *is* the edit.
 *
 * The knocked-out ink is `theme.color.bg`, and that is a derivation rather than a new
 * token: the ground the film normally sits on becomes the ink when the ground is taken
 * away. Both themes therefore answer for free, and neither gains a colour.
 */
export const TypographicStatementScene: React.FC<SceneProps<TypographicStatementProps>> = ({
  props,
  events,
  safeArea,
  profile,
  theme,
  durationInFrames,
}) => {
  const ground = emphasisColor(theme, props.emphasis);

  return (
    <Backdrop ground={ground}>
      <CameraRig profile={profile} durationInFrames={durationInFrames}>
        <SlotFrame safeArea={safeArea}>
          <CutFrame
            statement={props.statement}
            eyebrow={props.eyebrow}
            ordinal={props.ordinal}
            ground={ground}
            events={events}
            profile={profile}
            theme={theme}
          />
        </SlotFrame>
      </CameraRig>
    </Backdrop>
  );
};

const CutFrame: React.FC<{
  statement: string;
  eyebrow: string;
  ordinal: string;
  ground: string;
  events: SceneProps<TypographicStatementProps>['events'];
  profile: MotionProfile;
  theme: Theme;
}> = ({ statement, eyebrow, ordinal, ground, events, profile, theme }) => {
  const gap = useSpace(4);
  const stagger = staggerFrames(profile);
  const box = useFrameBox();
  const columnWidth = box.width * cutGeometry.columnRatio;

  const knock = theme.color.bg;
  /**
   * The theme's `inkMuted`, re-derived against this card's ground — and spent only on the
   * statement's own words, which are the only run of type here large enough to carry it.
   * `cutGeometry.unspokenMix` has the arithmetic.
   */
  const recessive = mix(knock, ground, cutGeometry.unspokenMix);

  /**
   * The fold. Every frame below is read off it rather than written here, which is what
   * lets a plan hold the statement back until the narration hands over to it, and lets a
   * plan carrying a recorded take walk the voice through the sentence.
   *
   * With no events at all `statementFrame` is 0 and `spoken` is `null`, and this renders
   * exactly as if the reducer did not exist: the whole sentence, standing.
   */
  const frame = useCurrentFrame();
  const state = resolveEvents(
    events,
    frame,
    initialTypographicStatementState(events),
    typographicStatementReducer,
  );
  const statementFrame = state.statementFrame.value;
  const revealed = statementFrame !== null;
  const start = statementFrame ?? 0;

  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* The real binding is the block width; the provider only publishes it to the fit.
          Without the div, the statement's 86% maxWidth would resolve against the whole
          frame box and the sentence would set wider than the column it was fitted to. */}
      <div
        style={{
          width: columnWidth,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap,
        }}
      >
        <ColumnProvider width={columnWidth}>
          {/* Outside the gate, like `quote`'s: it is what the frame stands on while the
              plan holds the statement back, and an empty statement does not take it away. */}
          {eyebrow ? (
            <Eyebrow startFrame={0} profile={profile} color={knock}>
              {eyebrow}
            </Eyebrow>
          ) : null}
          {revealed ? (
            statement === '' ? (
              /* A reveal like any other: it lands when the plan says the statement lands,
                 never at frame 0 ahead of its own gate. */
              <EmptyState
                message="Statement pending"
                startFrame={start}
                profile={profile}
                color={knock}
                ground={ground}
              />
            ) : (
              <Statement
                text={statement}
                startFrame={start + stagger}
                profile={profile}
                theme={theme}
                knock={knock}
                recessive={recessive}
                columnWidth={columnWidth}
                maxHeight={box.height * cutGeometry.statementShare}
                spoken={state.spoken.value}
              />
            )
          ) : null}
        </ColumnProvider>
      </div>
      {/* Apparatus, and outside the gate for the same reason the eyebrow is: a page number
          does not wait for the page. Absolute so that carrying one does not push the
          sentence off centre — the band `cutGeometry.statementShare` reserves is what keeps
          the two apart, rather than a row in the flow.

          In full knock, not the recessive tone, and its own size is why: 28px before
          density and 20px at the floor is not large text, so the 3:1 the recession clears
          is not the bar it has to pass. See `cutGeometry.unspokenMix`. It is quiet enough
          by being 20px in a corner next to a 168px sentence. */}
      {ordinal ? (
        <div style={{ position: 'absolute', right: 0, bottom: 0 }}>
          <AnimatedText
            startFrame={0}
            profile={profile}
            font="mono"
            step={0}
            weight={theme.type.weight.regular}
            tracking={theme.type.tracking.wide}
            color={knock}
          >
            {ordinal}
          </AnimatedText>
        </div>
      ) : null}
    </div>
  );
};

/**
 * The sentence, and the sweep.
 *
 * Every word is drawn from the first frame the statement lands. The sweep changes what
 * *tone* a word is in and never whether it is there, which is the whole difference between
 * this and the two treatments the design canvas rejected: a viewer reads ahead of the
 * narrator, and a card that fed them one word at a time would be a card they could not
 * read.
 *
 * `spoken === null` means nothing is driving the sweep — no `advanceWord` in the instance —
 * and every word stands in full. That is the still card, and it is the one a plan written
 * before a take has been recorded gets. Nothing else about the frame changes.
 *
 * **A finished sweep is the still card, exactly.** When the voice has run out of sentence
 * there is no word it is on, so the mark lifts and every word stands — which makes the
 * driven card and the undriven card the same frame once the sweep is done, and that
 * equality is asserted rather than hoped: `tests/render/typographic-statement.test.ts`
 * fails if a plan leaves anything permanently behind. It is also the right picture. A cursor
 * parked under the last word for the length of the hold reads as a voice that stopped
 * mid-sentence.
 */
const Statement: React.FC<{
  text: string;
  startFrame: number;
  profile: MotionProfile;
  theme: Theme;
  knock: string;
  recessive: string;
  columnWidth: number;
  maxHeight: number;
  spoken: number | null;
}> = ({ text, startFrame, profile, theme, knock, recessive, columnWidth, maxHeight, spoken }) => {
  /**
   * The face this type is actually set in, handed to the fit rather than assumed by it.
   * A serif at regular weight and normal tracking is not the width of the grotesque the
   * fit measures by default, and a fit that measures the wrong letterforms is an estimate.
   */
  const face: TypeFace = useMemo(
    () => ({
      fontFamily: theme.type.displayAlt,
      fontWeight: theme.type.weight.regular,
      tracking: theme.type.tracking.normal,
    }),
    [theme],
  );

  const step = useTitleStep(text, columnWidth, cutGeometry.statementStep, maxHeight, face);
  const size = useTypeSize(step);
  const { segments, tail } = useMemo(() => segmentsOf(text), [text]);

  /**
   * The clamp the reducer could not do. It counts events and never sees the props, so a
   * count past the end of the sentence has to stop here — and `checks.ts` refuses the plan
   * that would need it, at `validate`, long before a frame exists.
   */
  const reached = spoken === null ? segments.length : Math.min(spoken, segments.length);
  const sweeping = spoken !== null && reached < segments.length;
  /** The word the voice is on, or -1 when it is on none: undriven, or done. */
  const current = sweeping ? reached - 1 : -1;

  /** Punctuation belongs to the word in front of it, so a lead takes the tone before it. */
  const toneAt = (index: number): string => {
    if (!sweeping) return knock;
    /** Nothing sits in front of the first word, so its lead follows the sentence's future. */
    if (index < 0) return recessive;
    return index <= current ? knock : recessive;
  };

  const mark = {
    textDecorationLine: 'underline',
    textDecorationColor: knock,
    textDecorationThickness: `${Math.max(1, Math.round(size * cutGeometry.markThickness))}px`,
    textUnderlineOffset: `${Math.round(size * cutGeometry.markOffset)}px`,
  } as const;

  return (
    <AnimatedText
      startFrame={startFrame}
      profile={profile}
      font="displayAlt"
      step={step}
      weight={theme.type.weight.regular}
      tracking={theme.type.tracking.normal}
      color={knock}
      lineHeight={TITLE_LINE_HEIGHT}
      maxWidth={`${TITLE_MAX_WIDTH * 100}%`}
      displayRole="statement"
      style={{ textAlign: 'center' }}
    >
      {segments.map((segment, index) => (
        <Fragment key={`${index}-${segment.word}`}>
          {segment.lead ? <span style={{ color: toneAt(index - 1) }}>{segment.lead}</span> : null}
          <span style={{ color: toneAt(index), ...(index === current ? mark : {}) }}>
            {segment.word}
          </span>
        </Fragment>
      ))}
      {tail ? <span style={{ color: toneAt(segments.length - 1) }}>{tail}</span> : null}
    </AnimatedText>
  );
};

type Segment = { lead: string; word: string };

/**
 * The sentence cut into words plus whatever sits between them, so each word can carry its
 * own tone without a character of the copy going missing.
 *
 * `tokenise` and nothing else — the same module the anchor grammar consults and the same
 * one `checks.ts` counts with. A second definition of "word" here would let the n-th
 * `advanceWord` mean one thing to the check and another to the frame, which is precisely
 * the divergence the payload-free vocabulary exists to avoid.
 */
const segmentsOf = (text: string): { segments: Segment[]; tail: string } => {
  let cursor = 0;
  const segments = tokenise(text).map(({ text: word, index }) => {
    const lead = text.slice(cursor, index);
    cursor = index + word.length;
    return { lead, word };
  });
  return { segments, tail: text.slice(cursor) };
};
