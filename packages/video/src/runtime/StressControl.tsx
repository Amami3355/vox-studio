/**
 * One scene, drawn from props a test wrote, with a ruler held against the result.
 *
 * `BackdropControl` is a reference frame and `SceneControl` is a named instance; this is
 * the third kind — a control with **no content of its own**, whose content arrives as input
 * props. ADR-0003's content-stress amendment needs a frame per generated case, and the
 * cases are generated from the schemas, so there is nothing to enumerate here the way
 * `sceneControls` enumerates its named instances. What is fixed is the harness; what varies is
 * handed in. It is registered in `Root.tsx` for the reason every control is: the tests
 * render through the same bundle the studio does, and there is no second entry point.
 *
 * ## Why the assertion is in here and not in the test
 *
 * Two of the four questions ADR-0003 asks — containment and the quiet border — are about
 * regions of the canvas, and `tests/stress/content-stress.test.ts` asks them of the pixels
 * against the backdrop control, exactly as `safe-area.test.ts` does. The other two are not
 * visible in a still at all:
 *
 * - **Nothing is clipped.** `AnimatedText` wraps its children in `overflow: 'hidden'` to
 *   make the entrance read as a rise, and that same rule cuts a word that is wider than its
 *   column — mid-glyph, well inside the safe area. Containment passes, the quiet border
 *   passes, and the sentence is gone. A frame that has lost its tail and a frame that never
 *   had one are the same bytes; the difference exists only in the DOM, as the gap between
 *   `scrollWidth` and `clientWidth`.
 * - **Display type that has eaten its own scene.** `primitives/titleFit.ts` bounds a run of
 *   display type to a share of the box its scene was given — half for a header, the whole
 *   box for a statement. Both halves of that are browser facts and neither is a pixel one:
 *   what a run of display type actually cost is the height its line boxes came to, and the
 *   box it is a share of is the rectangle `SlotFrame` computed.
 *
 * So the browser measures, and a violation ends the render through `cancelRender` with the
 * element and the numbers in the message. The test names the case; this names the defect.
 * A pixel heuristic for the same two questions — a sharp cut in an ink profile, bands of ink
 * counted as lines — would be a guess about typography dressed as a measurement, and the
 * one thing worse than an unasked question is a check that answers a different one.
 *
 * ## The one `useState` in `packages/video/src`
 *
 * CONTEXT.md rule 4 says the render is a pure function of `(props, frame)` and names
 * `useState` among the things that break it. `LayoutProbe` holds one, and the exception is
 * stated here rather than left to be found: the state is Remotion's `delayRender` handle,
 * which has to be acquired once per mount and handed back to exactly one `continueRender`
 * or `cancelRender`. It carries no scene state, and nothing drawn depends on it — the frame
 * this control renders is the same frame with the probe deleted. Read rule 4 as binding on
 * everything that draws, which is why this is the only file in `src` that needed to say so.
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import {
  cancelRender,
  continueRender,
  delayRender,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { repositoryAssetLibrary } from '../assets/library';
import { createAssetResolver, resolveSceneAssets } from '../assets/resolver';
import { NO_SAFE_AREA, type SafeArea, type TimedEvent } from '../core/types';
import { waitForFonts } from '../design/fonts';
import type { MotionProfileId } from '../design/motion';
import { defaultTheme } from '../design/theme';
import { SCENE_BOX_ATTRIBUTE } from '../primitives/SlotFrame';
import { MAX_HEADER_SHARE, MAX_STATEMENT_SHARE } from '../primitives/titleFit';
import { requireCapability } from '../scenes/registry';
import { SceneRenderer } from './SceneRenderer';
import { controlIdFor } from './compositionIds';

export const STRESS_CONTROL_ID = controlIdFor('stress');

/**
 * How much a clip may exceed its content before it is a clip.
 *
 * Two pixels, not zero: `scrollWidth` and `clientWidth` are rounded to integers, and a
 * padding box computed from a camera allowance lands on fractions constantly. Nothing that
 * a viewer would call a cut sentence is two pixels wide.
 */
const CLIP_TOLERANCE_PX = 2;

/** The display face, as the theme spells it before the fallbacks. */
const DISPLAY_FAMILY = (defaultTheme.type.display.split(',')[0] as string).trim();

export type StressSceneProps = {
  capabilityId: string;
  /** Generated from the capability's published schema. See `tests/stress/cases.ts`. */
  props: Record<string, unknown>;
  /** Already folded to frames, never an anchor. See `StressScene` on why this exists. */
  events?: TimedEvent[];
  layout: string;
  motionProfile: MotionProfileId;
  /** The composition the compiler would have chosen, as the rectangle the scene sees. */
  safeArea: SafeArea;
};

/**
 * What the composition draws before anybody hands it a case: the empty frame.
 *
 * The honest default for a control with no content of its own. A specimen here would be an
 * example that never reached the catalog — the thing `SceneControl.tsx` calls a smuggled
 * example — and the empty state is the one frame this composition can show that is a real
 * claim of the schema rather than a choice.
 */
export const STRESS_CONTROL_DEFAULTS: StressSceneProps = {
  capabilityId: 'quote',
  props: { quote: '' },
  layout: 'centered',
  motionProfile: 'editorialStatic',
  safeArea: NO_SAFE_AREA,
};

/**
 * A message is prose, not type in a column, so this is deliberately a character count.
 *
 * `truncateToWidth` measures because a category label has a column that has to carry it.
 * A line of a failure message has a terminal, and sixty characters is the length past
 * which a finding stops being scannable. The rule the 2026-08-20 repair established — cut
 * to the column, never to a count — is about layout, and this is not layout.
 */
const excerpt = (text: string): string =>
  text.length <= 60 ? text : `${text.slice(0, 57).trimEnd()}…`;

/**
 * Text that its own clip is cutting.
 *
 * Every element that clips, carries text, and holds no replaced content — an image plate
 * clips on purpose and an `<img>` under `object-fit: cover` overflows on purpose, and
 * neither is a sentence losing its tail.
 */
const clippedText = (): string[] =>
  [...document.querySelectorAll<HTMLElement>('*')]
    .filter((element) => {
      const style = getComputedStyle(element);
      if (style.overflowX !== 'hidden' && style.overflowY !== 'hidden') return false;
      if ((element.textContent ?? '').trim() === '') return false;
      return element.querySelector('img, svg, video, canvas') === null;
    })
    .flatMap((element) => {
      const overflowX = element.scrollWidth - element.clientWidth;
      const overflowY = element.scrollHeight - element.clientHeight;
      if (overflowX <= CLIP_TOLERANCE_PX && overflowY <= CLIP_TOLERANCE_PX) return [];
      return [
        `clipped by ${overflowX}px × ${overflowY}px: "${excerpt((element.textContent ?? '').trim())}"`,
      ];
    });

/**
 * Legend entries standing on top of each other.
 *
 * `LinePlot` publishes that it owns "collision-safe plot padding", and for the life of the
 * capability its legend placed entry *n* at an even `(n * plotWidth) / series.length` — an
 * arithmetic that cannot know how wide a label is, next to a `series.label` that publishes a
 * 32-character ceiling. A review called that a collision; measured, it is not one *yet*, at
 * the shapes this schema admits. That is the worst kind of true claim: right by arithmetic
 * nobody did, and a type-scale change away from being wrong.
 *
 * So the claim is asked of the drawn frame rather than argued. Any group marked
 * `data-legend-entry` must not overlap its neighbour, and the check reads
 * `getBoundingClientRect` — the geometry the browser actually laid out, which is the only
 * reading that cannot disagree with the pixels.
 *
 * A one-pixel tolerance, the same `CLIP_TOLERANCE_PX` the clipping finding uses and for the
 * same reason: subpixel layout rounds, and a rule that fires on rounding is a rule that gets
 * turned off.
 */
const overlappingLegend = (): string[] => {
  const entries = [...document.querySelectorAll<SVGGraphicsElement>('[data-legend-entry]')];
  const boxes = entries
    .map((entry) => ({
      label: entry.getAttribute('data-legend-entry') ?? '',
      box: entry.getBoundingClientRect(),
    }))
    .filter(({ box }) => box.width > 0)
    .sort((a, b) => a.box.left - b.box.left);

  return boxes.flatMap((entry, index) => {
    const next = boxes[index + 1];
    if (!next) return [];
    const overlap = entry.box.right - next.box.left;
    if (overlap <= CLIP_TOLERANCE_PX) return [];
    return [
      `legend entries overlap by ${Math.round(overlap)}px: "${entry.label}" over "${next.label}"`,
    ];
  });
};

/**
 * Display type taking more of its scene than its role may.
 *
 * `MAX_HEADER_SHARE` is imported rather than restated. A `4` used to be written here, which
 * made this file a second home for a rule that already had one, and a second copy of a rule
 * is the copy that goes stale — the same argument `tests/stress/cases.ts` makes for deriving
 * its cases from the schema rather than from a fixture. It is not a tuning knob either:
 * ADR-0003 pre-commits the response to a breach *before* any case exists, because after
 * seeing the failure "lower the ceiling" explains everything.
 *
 * Only elements whose whole content is one run of text, because a run of display type is
 * what is being measured and a mixed element is several — the figure and its unit in
 * `stat_counter` are two spans on one line.
 *
 * **Both roles, each at the share it carries.** A run of display type that is the scene
 * rather than a label on it — a pull-quote — declares `data-display-role="statement"` and is
 * bounded by its box, which is `MAX_STATEMENT_SHARE` and is one. That is not a softer
 * version of the same check; it is the sentence this rule has always been written in, asked
 * out loud. A `statement` used to be filtered out here, which meant `quote` — the
 * capability the role was introduced for — was the one capability the fourth question
 * never reached. Anything unmarked counts as a header and carries the stricter share, so
 * a scene that forgets to classify its type cannot buy a larger budget by forgetting.
 *
 * **Derived here rather than read off the element.** The scene publishes the box it was
 * given and this computes the ceiling from it, so a header whose *own* budget was computed
 * wrongly is still caught. Asking the element what it was allowed would be grading the fit
 * against its own arithmetic, which is not a check.
 */
const oversizedDisplayType = (): string[] =>
  [...document.querySelectorAll<HTMLElement>('*')]
    .filter((element) => {
      const only = element.childNodes.length === 1 ? element.firstChild : null;
      if (!only || only.nodeType !== Node.TEXT_NODE) return false;
      if ((only.textContent ?? '').trim() === '') return false;
      return getComputedStyle(element).fontFamily.includes(DISPLAY_FAMILY);
    })
    .flatMap((element) => {
      const scene = element.closest<HTMLElement>(`[${SCENE_BOX_ATTRIBUTE}]`);
      const sceneHeight = Number(scene?.dataset.sceneHeight ?? 0);
      if (sceneHeight <= 0) return [];

      const role = element.dataset.displayRole === 'statement' ? 'statement' : 'header';
      const share = role === 'statement' ? MAX_STATEMENT_SHARE : MAX_HEADER_SHARE;
      const height = element.offsetHeight;
      if (height <= sceneHeight * share) return [];

      const range = document.createRange();
      range.selectNodeContents(element);
      return [
        `${role} takes ${height}px of a ${Math.round(sceneHeight)}px scene — ` +
          `${Math.round((height / sceneHeight) * 100)}%, over a ceiling of ` +
          `${Math.round(share * 100)}%, in ${range.getClientRects().length} lines: ` +
          `"${excerpt((element.textContent ?? '').trim())}"`,
      ];
    });

/**
 * Measures once the frame has settled, and fails the render if it finds anything.
 *
 * **At the last frame only, and nothing is lost by that.** The layout is the same at every
 * frame — `SlotFrame` computes its padding from the camera's *worst-case* bounds once, so
 * the box a scene is laid out in does not move, and the camera is a transform over the top
 * of it. What does move is the entrance: `AnimatedText` translates its content by up to
 * 42% of the type size while the spring settles, and a translation inside a clip is
 * overflow — measured mid-entrance, every rising line reads as a cut sentence. The last
 * frame is the one where every entrance has landed.
 *
 * Fonts first, because a metric taken against the fallback stack is a metric of a font this
 * video does not use, and the fallbacks are wider than Archivo at the same size.
 */
const LayoutProbe: React.FC<{ context: string }> = ({ context }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const settled = frame >= durationInFrames - 1;
  const [handle] = useState(() => delayRender(`Measuring the layout of ${context}`));

  useEffect(() => {
    if (!settled) {
      continueRender(handle);
      return;
    }

    waitForFonts()
      .then(() => {
        const findings = [...clippedText(), ...oversizedDisplayType(), ...overlappingLegend()];
        if (findings.length === 0) {
          continueRender(handle);
          return;
        }
        cancelRender(
          new Error(
            `CONTENT_DOES_NOT_FIT: ${context}\n${findings.map((one) => `  · ${one}`).join('\n')}`,
          ),
        );
      })
      .catch((error: unknown) => cancelRender(error));
  }, [handle, settled, context]);

  return null;
};

/**
 * Plays one generated case.
 *
 * A near-copy of `ControlScene`'s body, deliberately, and for the reason stated there: the
 * three answer to different owners. This one has no beats — `syntheticBeats` is not called
 * and the scene draws its settled state, because generated content is content and an event
 * is a plan's decision about time.
 *
 * **The one exception, and why it is not that rule bending.** A shape may put *time itself*
 * under stress rather than content: `line_chart` publishes that an annotation stays attached
 * to its point while labels around it thin, and the densest shape its schema admits is the
 * only place that claim can fail. There is no settled frame that states it, so the case
 * carries a resolved event — already folded to a frame, not an anchor a plan would write.
 * Nothing here decides *when*; the capability that made the claim does, in its own
 * `stress.ts`, and only for the ceiling.
 */
export const StressScene: React.FC<StressSceneProps> = ({
  capabilityId,
  props,
  events,
  layout,
  motionProfile,
  safeArea,
}) => {
  const capability = requireCapability(capabilityId);

  /**
   * Resolved the way `ExampleScene` resolves an example's, because a capability that
   * `requiresAssets` fails loudly in `SceneRenderer` otherwise — and `image_context`, whose
   * ceiling headline is one of the cases most worth rendering, is exactly that capability.
   */
  const assets = resolveSceneAssets(
    { id: 'stress', component: capabilityId, props, spansBeats: ['b1'] },
    createAssetResolver({ library: repositoryAssetLibrary }),
  );

  return (
    <>
      <SceneRenderer
        capabilityId={capabilityId}
        props={props}
        events={events}
        assets={assets}
        layout={layout}
        motionProfile={motionProfile}
        safeArea={safeArea}
      />
      <LayoutProbe
        context={`${capability.meta.id} in ${layout}, composed into ${JSON.stringify(safeArea)} under ${motionProfile}`}
      />
    </>
  );
};
