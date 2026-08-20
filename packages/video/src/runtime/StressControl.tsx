/**
 * One scene, drawn from props a test wrote, with a ruler held against the result.
 *
 * `BackdropControl` is a reference frame and `SceneControl` is a named instance; this is
 * the third kind — a control with **no content of its own**, whose content arrives as input
 * props. ADR-0003's content-stress amendment needs a frame per generated case, and the
 * cases are generated from the schemas, so there is nothing to enumerate here the way
 * `sceneControls` enumerates its three. What is fixed is the harness; what varies is
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
 * - **The line ceiling.** *"Five lines of display type is a header that has eaten its own
 *   scene"* is a sentence this repository already wrote (`primitives/titleFit.ts`). Counting
 *   those lines means counting line boxes, which is a browser fact and not a pixel one.
 *
 * So the browser measures, and a violation ends the render through `cancelRender` with the
 * element and the numbers in the message. The test names the case; this names the defect.
 * A pixel heuristic for the same two questions — a sharp cut in an ink profile, bands of ink
 * counted as lines — would be a guess about typography dressed as a measurement, and the
 * one thing worse than an unasked question is a check that answers a different one.
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
import { NO_SAFE_AREA, type SafeArea } from '../core/types';
import { waitForFonts } from '../design/fonts';
import type { MotionProfileId } from '../design/motion';
import { defaultTheme } from '../design/theme';
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

/**
 * Lines of display type above which a header has eaten its own scene.
 *
 * The number is `primitives/titleFit.ts`'s own sentence made checkable: five lines is the
 * failure it names, so four is the ceiling. It is not a tuning knob. ADR-0003 pre-commits
 * the response to a breach *before* any case exists, for the same reason the measurement
 * gate pre-commits its own — after seeing the failure, "lower the ceiling" explains
 * everything. Draw the box so it fits, or extend the degradation.
 */
const MAX_DISPLAY_LINES = 4;

/** The display face, as the theme spells it before the fallbacks. */
const DISPLAY_FAMILY = (defaultTheme.type.display.split(',')[0] as string).trim();

export type StressSceneProps = {
  capabilityId: string;
  /** Generated from the capability's published schema. See `tests/stress/cases.ts`. */
  props: Record<string, unknown>;
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
 * Display type set over more lines than a frame can carry.
 *
 * Only elements whose whole content is one run of text, because a line box is what is being
 * counted and a mixed element has more rects than it has lines — the figure and its unit in
 * `stat_counter` are two spans on one line, and counting their rects would report two.
 */
const overLongDisplayText = (): string[] =>
  [...document.querySelectorAll<HTMLElement>('*')]
    .filter((element) => {
      const only = element.childNodes.length === 1 ? element.firstChild : null;
      if (!only || only.nodeType !== Node.TEXT_NODE) return false;
      if ((only.textContent ?? '').trim() === '') return false;
      return getComputedStyle(element).fontFamily.includes(DISPLAY_FAMILY);
    })
    .flatMap((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const lines = range.getClientRects().length;
      if (lines <= MAX_DISPLAY_LINES) return [];
      return [
        `${lines} lines of display type, over a ceiling of ${MAX_DISPLAY_LINES}: "${excerpt(
          (element.textContent ?? '').trim(),
        )}"`,
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
        const findings = [...clippedText(), ...overLongDisplayText()];
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
 * three answer to different owners. This one has no beats and no events — generated content
 * is content, and an event is a plan's decision about time — so `syntheticBeats` is not
 * called and the scene draws its settled state.
 */
export const StressScene: React.FC<StressSceneProps> = ({
  capabilityId,
  props,
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
