/**
 * A recorded still hash is a property of the platform that recorded it.
 *
 * `hashStill` is md5 over the PNG bytes, so a recorded literal is a fingerprint of exact
 * pixels. Font rasterization differs between Windows and the Linux image — the glyphs land
 * on different pixels, invisibly to a reader and totally to a digest — so the same code
 * rendering the same frame correctly produces a different literal on each. Spike 11
 * measured it: every still-hash comparison failed inside the image, and each differed in
 * *every* hash rather than in one. That pattern is a platform difference, not a regression.
 *
 * The literals were accepted on Windows in August. What was wrong was never the numbers;
 * it was the claim around them, which said "this frame's fingerprint is X" when it only
 * ever meant "on the platform this was accepted on, X". This module is where the tests say
 * the second thing. The Windows set stays canonical: re-accepting the Linux set would
 * invert which platform the project trusts, and nobody has argued for the inversion.
 *
 * Two entry points because there are two call shapes in the suites and neither is worth
 * rewriting into the other — `expectRecordedStills` for the suites that compare a whole
 * named record at once, `expectRecordedStill` for the two that assert one value. Both take
 * the recorded literals keyed by platform, so the accepted hashes stay next to the prose
 * that accepted them.
 *
 * **This module is only for comparisons against a recorded literal.** The assertions that
 * compare two renders to each other — `expect(hashStill(a)).toBe(hashStill(b))`, and the
 * `.not.toBe(...)` relations saying a driven example differs from a canonical one — are
 * true on every platform and must keep using `expect` directly. They carry the determinism
 * and relation claims, which are worth more than the literals, and routing them through
 * here would say something false about them.
 */
import { expect } from 'vitest';

/**
 * What identifies a platform, and what it does not distinguish.
 *
 * `process.platform` is the identifier: `win32`, `linux`, `darwin`. It is the cheap answer
 * and it is deliberately coarser than the thing that actually varies, which is the font
 * stack. Two Linux images with different fonts installed rasterize differently and both
 * answer `linux` here, so a recorded set is trusted further than it has been measured the
 * moment a second image appears. Nothing today produces that second image — the render
 * suite runs on the Windows host, and the container's own render is green and does not run
 * these tests — so a finer key would be unevidenced precision. Narrow it when a second
 * Linux image exists, and record why it had to be narrowed.
 */
export type RenderPlatform = NodeJS.Platform;

/** The literals for one platform, keyed the way the calling suite names its frames. */
export type RecordedStills<TFrame extends string> = Partial<
  Record<RenderPlatform, Record<TFrame, string>>
>;

/** The literal for one platform, where the suite asserts a single frame. */
export type RecordedStill = Partial<Record<RenderPlatform, string>>;

const unrecorded = (recorded: Readonly<Record<string, unknown>>): Error => {
  const platform = process.platform;
  const known = Object.keys(recorded).sort();

  return new Error(
    [
      `No still hashes are recorded for platform "${platform}".`,
      `Recorded platforms: ${known.length > 0 ? known.join(', ') : 'none'}.`,
      '',
      'This is not a regression and the observed hash must not be copied out of this',
      'failure to silence it. A still hash is accepted by a person inspecting the frame it',
      'names, and the prose beside each recorded literal is that acceptance. Recording a',
      'set for a new platform means rendering these frames on it and reviewing the stills',
      'against that prose — a different piece of work from running the suite.',
      '',
      'Failing rather than skipping is the point: an unrecorded platform has to be visible',
      'as unrecorded. A skip here would leave a green suite that silently checked none of',
      'the accepted key frames.',
    ].join('\n'),
  );
};

const forCurrentPlatform = <TRecorded>(
  recorded: Partial<Record<RenderPlatform, TRecorded>>,
): TRecorded => {
  const entry = recorded[process.platform];
  if (entry === undefined) throw unrecorded(recorded as Record<string, unknown>);
  return entry;
};

/**
 * Compare a whole record of rendered frames against the literals accepted on this platform.
 * The failure a mismatch produces is the ordinary `toEqual` diff, naming every frame that
 * moved, which is what makes a real regression readable.
 */
export const expectRecordedStills = <TFrame extends string>(
  actual: Record<TFrame, string>,
  recorded: RecordedStills<TFrame>,
): void => {
  expect(actual).toEqual(forCurrentPlatform(recorded));
};

/** Compare a single rendered frame against the literal accepted on this platform. */
export const expectRecordedStill = (actual: string, recorded: RecordedStill): void => {
  expect(actual).toBe(forCurrentPlatform(recorded));
};
