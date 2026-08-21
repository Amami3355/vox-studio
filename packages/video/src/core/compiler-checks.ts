/**
 * Public compiler-check vocabulary.
 *
 * This is both the source of the report-code types and the data published in catalog.json.
 * A check therefore cannot join a report without explaining itself to a code-blind author.
 *
 * These strings are a **teaching channel and not only a diagnostic one**, which is what
 * makes the bar for writing one higher than it looks. ADR-0012 decides that the catalog's
 * examples need not cover every case an agent must write, precisely because a refusal
 * carries `means`, `repair`, and — where the check can compute it — an `expected` list of
 * the values that would have satisfied it. That decision is only sound while these two
 * fields actually say what to do next: a `repair` that restates the `code` in a sentence
 * moves the lesson nowhere.
 *
 * `tests/catalog-contract.test.ts` holds the floor and not the bar. It rejects an empty or
 * near-empty string and a field that is the code shouted back, which catches the shapes a
 * generated or hurried entry actually takes. It cannot judge whether a sentence teaches,
 * so a repair that paraphrases its own code passes — writing one that does not is a
 * review responsibility, and saying otherwise here would make this comment the same kind
 * of untrue claim it warns about.
 */

export type CompilerWarningSeverity = 'info' | 'quality' | 'important';

type CompilerErrorCheck<Code extends string = string> = {
  code: Code;
  regime: 'error';
  means: string;
  repair: string;
};

type CompilerWarningCheck<Code extends string = string> = {
  code: Code;
  regime: 'warning';
  /** The severities this code may carry in a situated CompileReport. */
  severity: readonly [CompilerWarningSeverity, ...CompilerWarningSeverity[]];
  means: string;
  repair: string;
};

const defineChecks = <
  const Checks extends Record<string, CompilerErrorCheck | CompilerWarningCheck>,
>(
  checks: Checks & { [Code in keyof Checks]: { code: Code } },
): Checks => checks;

export const COMPILER_CHECKS = {
  errors: defineChecks({
    UNKNOWN_CAPABILITY: {
      code: 'UNKNOWN_CAPABILITY',
      regime: 'error',
      means: 'A scene names a capability that the catalog does not publish.',
      repair: 'Choose a capability id from catalog.capabilities and rewrite the scene for it.',
    },
    INVALID_PROPS: {
      code: 'INVALID_PROPS',
      regime: 'error',
      means: 'A scene property does not satisfy the selected capability schema.',
      repair: 'Use the reported field and expected values to make props match that schema.',
    },
    UNKNOWN_ACTION: {
      code: 'UNKNOWN_ACTION',
      regime: 'error',
      means: 'An event names an action the selected capability does not support.',
      repair: 'Choose an action from the capability actions, or remove the event.',
    },
    UNKNOWN_LAYOUT: {
      code: 'UNKNOWN_LAYOUT',
      regime: 'error',
      means: 'A scene selects a layout that its capability does not publish.',
      repair: 'Replace it with one of the capability layouts listed in expected.',
    },
    INVALID_PAYLOAD: {
      code: 'INVALID_PAYLOAD',
      regime: 'error',
      means: 'An event payload is absent when required or fails its action schema.',
      repair: 'Author the payload from the action payloadSchema and the reported field details.',
    },
    UNKNOWN_ANCHOR: {
      code: 'UNKNOWN_ANCHOR',
      regime: 'error',
      means: 'An event anchor is malformed or points outside the beats available to its scene.',
      repair: 'Use catalog.time forms and anchor the event to scene or to a beat the scene spans.',
    },
    AMBIGUOUS_ANCHOR: {
      code: 'AMBIGUOUS_ANCHOR',
      regime: 'error',
      means: 'A word anchor names text that occurs more than once in the same beat.',
      repair: 'Split or rephrase the beat, or use an unambiguous boundary anchor.',
    },
    DEICTIC_ANCHOR_REQUIRED: {
      code: 'DEICTIC_ANCHOR_REQUIRED',
      regime: 'error',
      means: 'A pointing action does not land while the narration says the value it identifies.',
      repair: 'Move the event to one of the word anchors listed in expected.',
    },
    EVENT_BEFORE_ELEMENT_REVEALED: {
      code: 'EVENT_BEFORE_ELEMENT_REVEALED',
      regime: 'error',
      means: 'An event acts on an element the plan has not brought onto the frame yet.',
      repair: 'Move the reveal to an earlier anchor, or move this event to one at or after it.',
    },
    EVENTS_OUT_OF_ORDER: {
      code: 'EVENTS_OUT_OF_ORDER',
      regime: 'error',
      means: 'A scene lists its events in one order and they resolve to frames in another.',
      repair:
        'Move the overtaking event to a later anchor, or reorder the list so it reads in the order it plays.',
    },
    UNKNOWN_SLOT: {
      code: 'UNKNOWN_SLOT',
      regime: 'error',
      means: 'A persistent element requests a placement slot outside the public slot vocabulary.',
      repair: 'Choose a slot listed in expected and revalidate the plan.',
    },
    BELOW_MIN_DURATION: {
      code: 'BELOW_MIN_DURATION',
      regime: 'error',
      means: 'A compiled scene is too short to perform its capability animation safely.',
      repair:
        'Give the scene more narration time, usually by merging adjacent beats into its span.',
    },
    MISSING_ASSET_REFERENCE: {
      code: 'MISSING_ASSET_REFERENCE',
      regime: 'error',
      means: 'A scene that requires media has no authored asset requirement to resolve.',
      repair: 'Add the required asset-reference field described by the capability schema.',
    },
    MALFORMED_PLAN: {
      code: 'MALFORMED_PLAN',
      regime: 'error',
      means: 'The plan JSON does not have the required VideoPlan structure or field types.',
      repair: 'Repair the reported structural field using the published VideoPlan JSON Schema.',
    },
    DUPLICATE_ID: {
      code: 'DUPLICATE_ID',
      regime: 'error',
      means: 'Two authored objects reuse an id that must be unique in its plan scope.',
      repair: 'Rename one duplicate and update every reference to it.',
    },
    BEAT_NOT_CONTIGUOUS: {
      code: 'BEAT_NOT_CONTIGUOUS',
      regime: 'error',
      means: 'A section or scene claims beats that are separated in narration order.',
      repair: 'Make spansBeats one uninterrupted ordered range, or split the claimant.',
    },
    BEAT_DOUBLE_BOOKED: {
      code: 'BEAT_DOUBLE_BOOKED',
      regime: 'error',
      means: 'More than one section or scene claims the same narration beat.',
      repair: 'Assign that beat to exactly one claimant by adjusting their spansBeats arrays.',
    },
    BEAT_UNCOVERED: {
      code: 'BEAT_UNCOVERED',
      regime: 'error',
      means: 'A narration beat belongs to no section or to no scene within its section.',
      repair: 'Extend or add one claimant so every beat is covered exactly once.',
    },
    EMPTY_BEAT_SPAN: {
      code: 'EMPTY_BEAT_SPAN',
      regime: 'error',
      means: 'A section or scene claims no narration beats and therefore has no duration.',
      repair: 'Assign at least one beat, or remove the empty section or scene.',
    },
    SCENE_CUTS_MID_SENTENCE: {
      code: 'SCENE_CUTS_MID_SENTENCE',
      regime: 'error',
      means: 'A scene boundary interrupts a sentence before the narration reaches its end.',
      repair: 'Move the boundary to a sentence end or keep the sentence in one scene.',
    },
    MISSING_BEAT_TIMING: {
      code: 'MISSING_BEAT_TIMING',
      regime: 'error',
      means: 'The verified Take contains no timing for a beat present in the plan.',
      repair: 'Restore the matching plan and Take, or record a new Take for the changed narration.',
    },
    INVALID_TIMING_INPUT: {
      code: 'INVALID_TIMING_INPUT',
      regime: 'error',
      means: 'Take timings are invalid or are not a faithful projection of the current plan.',
      repair: 'Do not edit timings; verify the Take binding and record again when it is stale.',
    },
  }),
  warnings: defineChecks({
    SOFT_LIMIT_EXCEEDED: {
      code: 'SOFT_LIMIT_EXCEEDED',
      regime: 'warning',
      severity: ['info', 'quality'],
      means: 'A value is outside a capability recommendation but still satisfies its hard schema.',
      repair:
        'Follow the situated suggestion when visual quality matters; the plan may still ship.',
    },
    SLOT_RELOCATED: {
      code: 'SLOT_RELOCATED',
      regime: 'warning',
      severity: ['info'],
      means: 'The compiler moved a persistent element to avoid an unsafe or occupied placement.',
      repair: 'Accept the safe placement, or choose a conflict-free preferred slot.',
    },
    PERSISTENT_ELEMENT_HIDDEN: {
      code: 'PERSISTENT_ELEMENT_HIDDEN',
      regime: 'warning',
      severity: ['important'],
      means:
        'No safe placement remained, so a persistent element is absent for part of the render.',
      repair: 'Reduce simultaneous elements or change their requested placements.',
    },
    ASSET_PLACEHOLDER: {
      code: 'ASSET_PLACEHOLDER',
      regime: 'warning',
      severity: ['quality', 'important'],
      means:
        'Required media is represented by a placeholder because resolution is pending or failed.',
      repair:
        'Resolve a pending requirement, or fix the reported failed asset before final delivery.',
    },
    MOTION_PROFILE_REPETITION: {
      code: 'MOTION_PROFILE_REPETITION',
      regime: 'warning',
      severity: ['quality'],
      means: 'Adjacent scenes repeat a motion profile often enough to make pacing feel mechanical.',
      repair: 'Vary a scene motionProfile while keeping its intended editorial tone.',
    },
    VALUE_KIND_UNSTATED: {
      code: 'VALUE_KIND_UNSTATED',
      regime: 'warning',
      severity: ['quality'],
      means:
        'A series is measured in percent but has not said whether its values are shares, ' +
        'so anything collapsed beyond capacity would be added together.',
      repair:
        'Set `valueKind` to "share" when each value is a proportion of its own whole, or ' +
        'to "amount" to confirm the values really do add up.',
    },
    TITLE_DENSITY: {
      code: 'TITLE_DENSITY',
      regime: 'warning',
      severity: ['quality'],
      means: 'Prominent title text is denser than the capability recommends for legibility.',
      repair: 'Shorten the title or move supporting detail into secondary copy.',
    },
    SCENE_BELOW_RECOMMENDED_DURATION: {
      code: 'SCENE_BELOW_RECOMMENDED_DURATION',
      regime: 'warning',
      severity: ['quality'],
      means:
        'A scene clears its hard duration floor but has less time than its recommended pacing.',
      repair: 'Span more narration beats when the resulting slower presentation is preferable.',
    },
  }),
} as const;

export type CompilerErrorCode = keyof typeof COMPILER_CHECKS.errors;
export type CompilerWarningCode = keyof typeof COMPILER_CHECKS.warnings;

export type CompilerWarningSeverityFor<Code extends CompilerWarningCode> =
  (typeof COMPILER_CHECKS.warnings)[Code]['severity'][number];
