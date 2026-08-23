/**
 * Examples are normative. The agent imitates them far more faithfully than it follows a
 * description, so the set covers the shape of the problem and not just its happy path:
 * the canonical figure-led explanation, the same scene driven by the plan, an edge case
 * past the recommended copy band, and an empty case that proves the scene survives with
 * no copy at all.
 *
 * The canonical and edge examples resolve `character-explainer-reference` through the
 * repository library, so the grid, the still script and the render harness all exercise
 * the committed PNG rather than a path embedded in props. The driven example requests
 * the **same picture** for the same reason `image_context`'s does: two examples that
 * differ only in their events isolate what the events did, and the one example whose
 * behaviour is new is also the one a still can show.
 *
 * None of these carries a word anchor, and none needs to. Unlike a deictic action, an
 * `accentCharacter` may be timed anywhere a boundary reaches; the word form is exercised
 * against a real take by the render suite, which compiles a plan rather than publishing
 * an example a scene cannot anchor — see ADR-0012 and the Teaching surface entry in
 * `CONTEXT.md` for why no compensating example is invented here.
 */
import type { SceneExample } from '../../core/types';

/** The canonical copy and figure, kept in one place so the driven example can differ only in its events. */
const educator = {
  label: 'Housing educator',
  headline: 'Your rent has a chain of intermediaries',
  explanation:
    'From the landlord to the lender, every link in the chain takes its share before the month begins.',
  assetRequirement: {
    type: 'character',
    subject: 'Original editorial educator with an open explanatory gesture',
    treatment: 'illustration',
    orientation: 'portrait',
    identityKey: 'character-explainer-reference',
  },
} as const;

export const characterExplainerExamples: SceneExample[] = [
  {
    id: 'example-explainer-canonical',
    title: 'Canonical figure-led explanation',
    note: 'The shot this capability exists for: one educator carrying the claim while the copy explains it.',
    component: 'character_explainer',
    layout: 'sideBySide',
    motionProfile: 'subtleDrift',
    /**
     * Three beats, matching the driven example exactly, so that "differs only in its
     * events" is true of the pair rather than nearly true. An eventless instance
     * resolves no anchors, so the span costs this frame nothing and buys the comparison
     * its one variable.
     */
    spansBeats: ['b1', 'b2', 'b3'],
    props: { ...educator },
  },
  /**
   * The driven example: event entrances, a repeated accent, and the recurring figure the
   * `identityKey` names. The copy arrives first so the frame shows the independence the
   * vocabulary promises — the explanation stands while the figure is still held back.
   */
  {
    id: 'example-explainer-driven',
    title: 'Plan-driven entrances and a repeated accent — the figure follows the narration',
    note: 'The copy lands first, the character enters a beat later, and two accents pulse the figure where the narration emphasises it. Same figure, copy and profile as the canonical example; only the events differ.',
    component: 'character_explainer',
    layout: 'sideBySide',
    motionProfile: 'subtleDrift',
    spansBeats: ['b1', 'b2', 'b3'],
    events: [
      { at: 'b1.start+short', action: 'revealCopy' },
      { at: 'b2.start', action: 'revealCharacter' },
      { at: 'b2.start+short', action: 'accentCharacter' },
      { at: 'b3.start', action: 'accentCharacter' },
    ],
    props: { ...educator },
  },
  {
    id: 'example-explainer-long',
    title: 'Edge case — copy past the recommended band',
    note: 'Edge case for label, headline and explanation density: every field near its ceiling steps down or wraps inside the copy column while the same resolved figure carries the frame.',
    component: 'character_explainer',
    layout: 'sideBySide',
    motionProfile: 'pushIn',
    spansBeats: ['b1'],
    props: {
      label: 'Mira Halvorsen, housing policy educator for the northern cities',
      headline:
        'Every repair proposed since 2015 has assumed a landlord and a lender who never both tightened at once',
      explanation:
        'Households that saved through the quiet years are now meeting landlords refinancing at higher rates and lenders pricing the risk back in, in the same season, for the first time in a decade.',
      assetRequirement: {
        type: 'character',
        subject: 'Original editorial educator with an open explanatory gesture',
        treatment: 'illustration',
        orientation: 'portrait',
        identityKey: 'character-explainer-reference',
      },
    },
  },
  {
    id: 'example-explainer-empty',
    title: 'Empty case — no copy beside the character',
    note: 'Empty copy remains renderable beside a valid character requirement: the unresolved figure shows its honest subject plate and the copy column a designed pending note.',
    component: 'character_explainer',
    layout: 'sideBySide',
    motionProfile: 'editorialStatic',
    spansBeats: ['b1'],
    props: {
      label: '',
      headline: '',
      explanation: '',
      assetRequirement: {
        type: 'character',
        subject: 'Resident guide illustration pending resolution',
        treatment: 'cutout',
        orientation: 'square',
      },
    },
  },
];
