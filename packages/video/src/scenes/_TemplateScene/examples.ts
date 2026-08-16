/**
 * TEMPLATE — copy this folder, do not register this scene.
 *
 * Examples are normative. The agent imitates them far more faithfully than it follows a
 * description, so the set has to cover the shape of the problem and not just its happy
 * path. The catalog contract requires **at least three**, and requires the words "edge" and
 * "empty" to appear somewhere in an example's title *or* its note — it matches against
 * `${title} ${note}`, so a title alone satisfies it. That is the checklist, enforced.
 *
 * Rules the contract also enforces, and the reasons they exist:
 *   - Time is symbolic. An example carrying a frame teaches the agent frames.
 *   - `layout` must name a layout that exists.
 *   - `spansBeats` must be non-empty; a scene's duration is the sum of the beats it spans.
 *   - The example must validate against its own capability.
 *
 * A rule the contract cannot enforce: an example with a deictic action needs a word anchor,
 * and a scene example has no take — `syntheticBeats` gives it `words: []`, against which a
 * word anchor throws by design. So a deictic action cannot be illustrated here. ADR-0012
 * says that is legal: illustrate it in a structural plan example, or leave it out. Do not
 * invent an example elsewhere to compensate.
 *
 * If two examples differ only in their events, an agent comparing them sees one variable
 * and not three. That is worth more than two unrelated pretty frames.
 */
import type { SceneExample } from '../../core/types';

export const templateSceneExamples: SceneExample[] = [
  {
    id: 'example-template-canonical',
    title: 'TODO canonical use',
    note: 'TODO the shot this capability exists for, in one sentence.',
    component: 'template_scene',
    layout: 'centered',
    motionProfile: 'editorialStatic',
    spansBeats: ['b1'],
    props: {
      statement: 'Rent now takes a third of the average wage',
      eyebrow: 'The claim',
    },
  },
  {
    id: 'example-template-long',
    title: 'Edge case — long statement',
    note: 'Edge case for statement density: copy past the recommended band drops a type step.',
    component: 'template_scene',
    layout: 'centered',
    motionProfile: 'subtleDrift',
    spansBeats: ['b1'],
    props: {
      statement:
        'For first-time buyers the distance between wages and housing costs keeps widening, year after year',
      eyebrow: 'The claim',
    },
  },
  /**
   * The driven example, and the reason there are four rather than three.
   *
   * It carries the *same props* as the canonical one and differs only in its events, so an
   * agent comparing the two sees one variable and not three. Without it nothing exercises
   * `state.ts`, and a capability copied from a template whose reducer no example reaches is
   * a capability whose reducer nobody has looked at.
   *
   * `emphasizeWord` is absent because it *cannot* be here — see the header.
   */
  {
    id: 'example-template-driven',
    title: 'Plan-driven reveal — the statement lands a beat after the eyebrow',
    note: 'The plan holds the statement back, so the eyebrow is alone on the frame while the narration reaches the claim. Same props as the canonical example; only the events differ.',
    component: 'template_scene',
    layout: 'centered',
    motionProfile: 'subtleDrift',
    spansBeats: ['b1', 'b2'],
    events: [{ at: 'b2.start', action: 'revealStatement' }],
    props: {
      statement: 'Rent now takes a third of the average wage',
      eyebrow: 'The claim',
    },
  },
  {
    id: 'example-template-empty',
    title: 'Empty case — no statement',
    note: 'Empty copy remains renderable; the eyebrow carries the frame on its own.',
    component: 'template_scene',
    layout: 'centered',
    motionProfile: 'editorialStatic',
    spansBeats: ['b1'],
    props: {
      statement: '',
      eyebrow: 'Pending',
    },
  },
];
