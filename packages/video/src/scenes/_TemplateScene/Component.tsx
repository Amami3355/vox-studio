import type React from 'react';
import { useCurrentFrame } from 'remotion';
import { resolveEvents } from '../../core/events';
import type { SceneProps } from '../../core/types';
import { staggerFrames } from '../../design/motion';
import {
  Backdrop,
  CameraRig,
  ColumnProvider,
  Eyebrow,
  SceneTitle,
  SlotFrame,
  Stamp,
  useFrameBox,
  useSpace,
} from '../../primitives';
import { centeredGeometry } from './layouts';
import type { TemplateSceneProps } from './schema';
import { initialTemplateSceneState, templateSceneReducer } from './state';

/**
 * TEMPLATE — copy this folder, do not register this scene.
 *
 * The shell every scene shares, in order: `Backdrop` → `CameraRig` → `SlotFrame` → the
 * layout. Everything visual comes from L0/L1 — a scene adds no colour, easing or duration
 * of its own, because a scene that invents a duration is a scene the motion profile can no
 * longer pace.
 *
 * It never throws over a missing asset: `SceneRenderer` is where a capability that requires
 * assets fails loudly, so by the time a frame is being drawn the only honest behaviour left
 * is to degrade.
 *
 * "Half" is a proportion, not a side. If this scene ever declares a composed form in
 * `meta.ts`, read the shape from `useFrameBox()` and draw the arrangement that fits it. The
 * component is told the box it got, never the slot the compiler chose (ADR-0003 decision 4).
 */
/* TODO everything below the shell is a worked example. Keep the `Backdrop` / `CameraRig` /
   `SlotFrame` order and the fold; replace the layout with yours. */
export const TemplateScene: React.FC<SceneProps<TemplateSceneProps>> = ({
  props,
  events,
  safeArea,
  profile,
  durationInFrames,
}) => (
  <Backdrop>
    <CameraRig profile={profile} durationInFrames={durationInFrames}>
      <SlotFrame safeArea={safeArea}>
        <CenteredLayout
          statement={props.statement}
          eyebrow={props.eyebrow}
          events={events}
          profile={profile}
        />
      </SlotFrame>
    </CameraRig>
  </Backdrop>
);

const CenteredLayout: React.FC<{
  statement: string;
  eyebrow: string;
  events: SceneProps<TemplateSceneProps>['events'];
  profile: SceneProps<TemplateSceneProps>['profile'];
}> = ({ statement, eyebrow, events, profile }) => {
  const gap = useSpace(3);
  const stagger = staggerFrames(profile);

  /**
   * The fold. Every frame below is read off it rather than written here, which is what lets
   * a plan hold the statement back until the narration reaches it. With no events at all
   * `statementFrame` is 0 and this renders as if the reducer did not exist.
   */
  const frame = useCurrentFrame();
  const state = resolveEvents(
    events,
    frame,
    initialTemplateSceneState(events),
    templateSceneReducer,
  );
  const statementFrame = state.statementFrame.value;
  const emphasis = state.emphasis.value;

  /**
   * Declared to the subtree rather than passed to a component. `SceneTitle` sizes itself
   * against the column it is in, so anything added to this column later inherits the same
   * fact without anyone remembering to wire it.
   */
  const box = useFrameBox();
  const columnWidth = box.width * centeredGeometry.columnRatio;

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap,
      }}
    >
      <ColumnProvider width={columnWidth}>
        {eyebrow ? (
          <Eyebrow startFrame={statementFrame ?? 0} profile={profile}>
            {eyebrow}
          </Eyebrow>
        ) : null}
        {/* Nothing while the plan holds the statement back. The column keeps its shape, so
            the eyebrow does not jump when the statement arrives.

            The stamp is mounted INSIDE this gate, not beside it, and that placement is what
            `checks.ts` is about. A stamp drawn as a sibling would survive a held-back
            statement and the check would be rejecting plans that render correctly. Whatever
            an element is drawn into, its emphasis has to be drawn into as well, or the
            refusal beside it is false. */}
        {statementFrame === null ? null : (
          <>
            {statement ? (
              <SceneTitle startFrame={statementFrame + stagger} profile={profile}>
                {statement}
              </SceneTitle>
            ) : null}
            {emphasis ? (
              <Stamp text={emphasis} startFrame={state.emphasis.since} profile={profile} />
            ) : null}
          </>
        )}
      </ColumnProvider>
    </div>
  );
};
