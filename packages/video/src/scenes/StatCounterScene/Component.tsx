import type React from 'react';
import { useCurrentFrame } from 'remotion';
import { resolveEvents } from '../../core/events';
import type { SceneProps } from '../../core/types';
import type { MotionProfile } from '../../design/motion';
import { staggerFrames } from '../../design/motion';
import { type Theme, emphasisColor } from '../../design/theme';
import {
  AnimatedText,
  Backdrop,
  CameraRig,
  ColumnProvider,
  EmptyState,
  SceneTitle,
  SlotFrame,
  composedStepCeiling,
  useFrameBox,
  useSpace,
  useTitleStep,
  useTypeSize,
} from '../../primitives';
import { statGeometry } from './layouts';
import type { StatCounterSceneProps } from './schema';
import { initialStatCounterSceneState, statCounterReducer } from './state';

/**
 * The shell every scene shares, in order: `Backdrop` → `CameraRig` → `SlotFrame` → the
 * layout. Everything visual comes from L0/L1 — this file adds no colour, easing or
 * duration of its own, because a scene that invents a duration is a scene the motion
 * profile can no longer pace.
 *
 * The frame is one figure and what it counts: a label, the value at display scale with
 * its unit beside it, and a supporting line beneath. There is no camera by default —
 * `editorialStatic` sets `camera: none`, the honest choice for a number that has to hold
 * on its own.
 *
 * It never throws over a missing asset: `SceneRenderer` is where a capability that
 * requires assets fails loudly, so by the time a frame is being drawn the only honest
 * behaviour left is to degrade.
 */
export const StatCounterScene: React.FC<SceneProps<StatCounterSceneProps>> = ({
  props,
  events,
  safeArea,
  theme,
  profile,
  durationInFrames,
}) => (
  <Backdrop>
    <CameraRig profile={profile} durationInFrames={durationInFrames}>
      <SlotFrame safeArea={safeArea}>
        <StatFrame
          value={props.value}
          label={props.label}
          unit={props.unit}
          sublabel={props.sublabel}
          emphasis={props.emphasis}
          events={events}
          profile={profile}
          theme={theme}
        />
      </SlotFrame>
    </CameraRig>
  </Backdrop>
);

const StatFrame: React.FC<{
  value: number;
  label: string;
  unit: string;
  sublabel: string;
  emphasis: StatCounterSceneProps['emphasis'];
  events: SceneProps<StatCounterSceneProps>['events'];
  profile: SceneProps<StatCounterSceneProps>['profile'];
  theme: Theme;
}> = ({ value, label, unit, sublabel, emphasis, events, profile, theme }) => {
  const gap = useSpace(3);
  const stagger = staggerFrames(profile);
  const box = useFrameBox();

  /**
   * The composed form. A portrait box means the figure is sharing the frame — a
   * persistent element is standing in the other half — so the column takes the box's
   * full width and the label sets a rung quieter than the length ladder would give it on
   * its own. Both numbers are the layout's (`layouts.ts`); the full frame is untouched,
   * which is what keeps every accepted key frame stable.
   */
  const composed = box.width / box.height < statGeometry.composeBelowAspect;
  const columnWidth =
    box.width * (composed ? statGeometry.composedColumnRatio : statGeometry.columnRatio);

  /**
   * The fold. Every frame below is read off it rather than written here, which is what
   * lets a plan hold the number back until the narration says it.
   *
   * `statFrame === null` means the plan drove the reveal and it has not landed yet, so
   * only the label is on the frame — an empty stat column is the plan's choice, not a
   * defect. With no events at all it is 0 and this renders exactly as if the reducer did
   * not exist.
   */
  const frame = useCurrentFrame();
  const state = resolveEvents(
    events,
    frame,
    initialStatCounterSceneState(events),
    statCounterReducer,
  );
  const statFrame = state.statFrame.value;
  const revealed = statFrame !== null;
  const start = statFrame ?? 0;

  /**
   * The value is set at the top display step. It is a figure, not prose, so it does not
   * climb the length ladder — a number does not wrap. The widest-value fit below is what
   * keeps a long figure inside its column.
   *
   * The label, by contrast, is prose and *does* wrap, so it goes through `useTitleStep`
   * and the length ladder like any other heading.
   *
   * The figure is set in its plain string form — no grouping, no forced decimals. A value
   * needing precision past an integer already carries it (`12.5`). There is no formatter
   * seam here because there is no formatting rule yet, and an empty one would be a hook
   * the spec never asked for.
   */
  const valueText = `${value}`;
  const valueStep = useTitleStep(valueText, columnWidth, { ceiling: statGeometry.valueStep });
  const unitStep = Math.max(0, valueStep - statGeometry.unitStepDrop);

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
      {/* The real binding is the column width; the provider only publishes it to the fit. */}
      <div style={{ width: columnWidth, display: 'flex', flexDirection: 'column', gap }}>
        <ColumnProvider width={columnWidth}>
          {/* The standing element, outside the gate on purpose: it is what the frame
              stands on while the plan holds the number back. The empty state is its
              replacement and not a reveal of its own, so it stands at frame 0 too —
              gating it behind `revealStat` would leave a driven instance with an empty
              label drawing nothing at all until the reveal landed.

              This is where `stat_counter` and `quote` legitimately differ: `quote` gates
              its empty state because there the empty prop is the *gated* one and the
              eyebrow keeps standing. Here the empty prop is the standing one, so nothing
              would be left behind the gate. */}
          {label !== '' ? (
            <SceneTitle
              startFrame={0}
              profile={profile}
              color={theme.color.ink}
              maxStep={
                composed
                  ? composedStepCeiling(label.length, statGeometry.composedStepDrop)
                  : undefined
              }
            >
              {label}
            </SceneTitle>
          ) : (
            <EmptyState message="Stat pending" startFrame={0} profile={profile} />
          )}
          {/* Hidden rather than unmounted, which is the whole of the "nothing jumps" rule.
              The column is centred, so a block that arrives on the reveal grows it and
              shoves the label upward — the label moved on the frame the number landed, and
              a hash of the whole still cannot see it because the still is *supposed* to
              differ there. `visibility` keeps the box in the layout and takes the ink off
              it, so the space the number will occupy is held from frame 0.

              The reserve is the real block, not a proportion in `layouts.ts`. A reserved
              height stated as a number is a second claim about how tall the value is, and
              it would be wrong the first time the fit dropped a step; the element that will
              stand there measures itself.

              Nothing to reserve when `label === ''` — the empty state replaces the whole
              column, so the frame has no held-back element and reserving would push the
              pending state off centre. */}
          {label !== '' ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap,
                visibility: revealed ? 'visible' : 'hidden',
              }}
            >
              <ValueLine
                valueText={valueText}
                unit={unit}
                valueStep={valueStep}
                unitStep={unitStep}
                color={emphasisColor(theme, emphasis)}
                startFrame={start + stagger}
                profile={profile}
                theme={theme}
              />
              {sublabel !== '' ? (
                <AnimatedText
                  startFrame={start + stagger * 2}
                  profile={profile}
                  font="body"
                  step={1}
                  color={theme.color.inkMuted}
                >
                  {sublabel}
                </AnimatedText>
              ) : null}
            </div>
          ) : null}
        </ColumnProvider>
      </div>
    </div>
  );
};

/**
 * The figure and its unit, set as one block so they enter on a single clip. The unit is
 * a nested span at a smaller step rather than its own primitive, the same shape as
 * `quote`'s attribution: a second entrance for a suffix would be a beat nothing asked for.
 *
 * `tabular-nums` comes from `AnimatedText`, which is what keeps a proportional figure
 * from jittering if this ever animates. The colour is the emphasis role's, resolved
 * above so this stays a presentational block.
 */
const ValueLine: React.FC<{
  valueText: string;
  unit: string;
  valueStep: number;
  unitStep: number;
  color: string;
  startFrame: number;
  profile: MotionProfile;
  theme: Theme;
}> = ({ valueText, unit, valueStep, unitStep, color, startFrame, profile, theme }) => (
  <AnimatedText
    startFrame={startFrame}
    profile={profile}
    font="display"
    step={valueStep}
    weight={theme.type.weight.bold}
    tracking={theme.type.tracking.tight}
    color={color}
    lineHeight={1}
  >
    {valueText}
    {unit !== '' ? <Unit text={unit} step={unitStep} theme={theme} /> : null}
  </AnimatedText>
);

/**
 * The unit, appended at a smaller step and a lighter weight so it reads as a suffix.
 *
 * The gap is proportional to the unit's own size rather than a spacing token, and the
 * proportion lives in `layouts.ts` with the rest of the geometry — a scene that invents its
 * own number is a scene the layout can no longer answer for.
 */
const Unit: React.FC<{ text: string; step: number; theme: Theme }> = ({ text, step, theme }) => {
  const size = useTypeSize(step);
  return (
    <span
      style={{
        marginLeft: size * statGeometry.unitGap,
        fontSize: size,
        fontWeight: theme.type.weight.medium,
      }}
    >
      {text}
    </span>
  );
};
