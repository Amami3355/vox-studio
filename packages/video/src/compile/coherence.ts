/**
 * Does the plan still talk about values the frame no longer shows?
 *
 * This is the defect that made the 2026-08-21 render *wrong* rather than merely reduced.
 * `capacity.ts` explains why Berlin left the chart. It cannot notice that b3 still says
 * *"Berlin sits twenty points lower"*, and that the annotation still reads *"Twenty points
 * above Berlin"*, over a chart Berlin was collapsed out of. A viewer hears a name and looks
 * for it; every safe-area, containment and fit assertion in the repository passes on that
 * frame.
 *
 * **Why this is decidable without understanding a word of English.** The plan supplies both
 * halves of its own contradiction: it wrote `Berlin` into `data`, and it wrote `Berlin`
 * into b3. Nothing here judges prose. It asks one question — *is a name this plan put in
 * its data, and the compiler then removed, still being spoken?* — of strings the plan
 * itself authored.
 *
 * **That restriction is the whole precision budget.** Narration legitimately names things
 * that are not chart rows: b1's *"Across Europe's biggest cities"* is correct as written,
 * and a check that flagged every capitalised token absent from `data` would fire on it and
 * on almost every beat ever written. A warning that cries constantly is worse than
 * silence, because it teaches an agent to skip the report. Only collapsed labels are ever
 * considered, so a false positive requires the plan to name a value it deliberately
 * dropped — which is exactly the case worth reporting anyway.
 *
 * The precedent is `DEICTIC_ANCHOR_REQUIRED` in `catalog/validate.ts`, which already holds
 * a pointing gesture to the word the narrator is saying. This is the same family, one step
 * further out: there, the gesture must land on the word; here, the word must still have
 * something to land on.
 */
import type { Series } from '../core/aggregate';
import type { CompilerWarning } from '../core/types';
import { tokenise } from '../core/words';
import type { CompiledScene } from './document';

/**
 * Does `text` name `label`, as words rather than as a substring?
 *
 * Through the repository's one tokeniser, so "Berlin," and "Berlin" are the same name and
 * "Berliner" is not — and so a multi-word label like "New York" is matched as the run of
 * words it is. Folded case: a beat that opens a sentence with a lower-case label, or names
 * a place mid-sentence in a language that capitalises differently, is naming it either way.
 */
const names = (text: string, label: string): boolean => {
  const needle = tokenise(label).map((word) => word.text.toLocaleLowerCase());
  if (needle.length === 0) return false;

  const haystack = tokenise(text).map((word) => word.text.toLocaleLowerCase());
  return haystack.some(
    (_, index) =>
      index + needle.length <= haystack.length &&
      needle.every((word, offset) => haystack[index + offset] === word),
  );
};

/** Every free-text string an event carries, with the field it came from. */
const eventTexts = (scene: CompiledScene): { field: string; text: string }[] =>
  scene.events.flatMap((event, index) =>
    Object.entries(event.payload ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([key, text]) => ({ field: `events[${index}].payload.${key}`, text })),
  );

export const reportCollapsedMentions = ({
  scene,
  collapsed,
  beats,
  sectionId,
  warnings,
}: {
  scene: CompiledScene;
  collapsed: Series[];
  /** The beats this scene spans, as the plan wrote them. */
  beats: { id: string; text: string }[];
  sectionId: string;
  warnings: CompilerWarning[];
}): void => {
  for (const entry of collapsed) {
    /**
     * A payload field that *is* the label is a pointing gesture at a bar that will not be
     * drawn — the same "renders fine, animates nothing" failure `BarChartScene/checks.ts`
     * already rejects, except that here the label was in `data` and the compiler is what
     * removed it. Reported before the prose case because its repair is different: the
     * event has to point somewhere else, or the value has to stay.
     */
    const pointing = eventTexts(scene).filter(({ text }) => text === entry.label);
    for (const { field } of pointing) {
      warnings.push({
        code: 'NARRATION_NAMES_COLLAPSED_VALUE',
        severity: 'important',
        sceneId: scene.id,
        sectionId,
        field,
        message:
          `"${entry.label}" was collapsed out of "${scene.id}", and this event points at ` +
          'it by name. The event will resolve and draw nothing.',
        suggestion:
          'Keep the value on screen — see CAPACITY_REDUCED_BY_COMPOSITION — or point the ' +
          'event at a value that survives.',
      });
    }

    const spoken = beats.filter((beat) => names(beat.text, entry.label));
    const written = eventTexts(scene).filter(
      ({ text }) => text !== entry.label && names(text, entry.label),
    );
    if (spoken.length === 0 && written.length === 0) continue;

    const where = [
      ...spoken.map((beat) => `beat "${beat.id}"`),
      ...written.map(({ field }) => `\`${field}\``),
    ].join(' and ');

    warnings.push({
      code: 'NARRATION_NAMES_COLLAPSED_VALUE',
      severity: 'important',
      sceneId: scene.id,
      sectionId,
      field: `props.data`,
      message:
        `"${entry.label}" was collapsed out of "${scene.id}" and is not on screen, but ` +
        `${where} still names it. The words describe a frame the viewer is not being shown.`,
      suggestion:
        'Keep the value on screen — see CAPACITY_REDUCED_BY_COMPOSITION — or rewrite the ' +
        'text so it does not name a value this scene does not draw.',
    });
  }
};
