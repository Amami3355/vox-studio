/**
 * How a Remotion composition id is spelled, in one place.
 *
 * The ids are generated three times over — once per example, once per control, and once
 * for the backdrop — and every one of them has to survive the same rule: Remotion allows
 * letters, digits and dashes only. Spelling the sanitiser at each site is how the three
 * drift apart, so the rule lives here and the callers name the shape they want.
 */
const sanitize = (id: string): string => id.replace(/[^a-zA-Z0-9-]/g, '-');

/** One per published example, the composition the catalog and the render suite target. */
export const compositionIdFor = (capabilityId: string, exampleId: string): string =>
  sanitize(`${capabilityId}--${exampleId}`);

/**
 * One per control. The shared `control--` prefix is the whole point: it sorts every
 * reference render together in the studio, away from the examples a reader is browsing.
 */
export const controlIdFor = (controlId: string): string => sanitize(`control--${controlId}`);
