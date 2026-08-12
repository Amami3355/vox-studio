import type React from 'react';
import { Backdrop, ThemeProvider } from '../primitives';

/**
 * The ground with nothing standing on it — the reference frame the render contract tests
 * measure against.
 *
 * `tests/render/safe-area.test.ts` used to ask its questions as a relation between two
 * examples: outside the reserved rectangle the two frames must be byte-identical, because
 * that region is backdrop and backdrop does not know what the scene says. True, but it has
 * a hole with a name — *fixed chrome*. The `Visual context` eyebrow is byte-identical in
 * every `image_context` render, so if the layout ever pushed **it** over the edge, both
 * frames would still match and the assertion would still pass. Anything a capability draws
 * the same way every time is invisible to a relation between its own renders.
 *
 * A control render closes it by giving the question an absolute answer instead of a
 * relative one: that region must equal *the backdrop*, not merely equal itself elsewhere.
 * `Backdrop` is deterministic — a flat fill and one radial gradient, no noise, no clock —
 * and every scene component mounts it outside `CameraRig`, so it is never transformed and
 * the frames are comparable pixel for pixel.
 *
 * It also makes each render independently checkable, which is why the suite no longer
 * needs to pair examples up: one render against the control says more than two renders
 * against each other, and every example in the catalog can be asked.
 *
 * Registered as a composition because the tests render through the same bundle the studio
 * does, and there is no second entry point. It is legitimately viewable: this is the ground
 * every frame in the catalog sits on.
 */
export const BackdropControl: React.FC = () => (
  <ThemeProvider>
    <Backdrop />
  </ThemeProvider>
);

export const BACKDROP_CONTROL_ID = 'control--backdrop';
