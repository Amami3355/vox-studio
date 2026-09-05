/**
 * The scoping seam itself, tested where it costs nothing.
 *
 * `still-hashes.ts` lives beside the render suite because that is who calls it, but it opens
 * no browser and renders nothing — it is a lookup and two assertions. So it is tested here,
 * in the default suite, for the reason `vitest.config.ts` already gives for keeping the
 * stress *generator* out of the browser suite: only the consequence needs Chrome.
 *
 * The case worth having is the third one. On this machine the recorded platform is present
 * and the seam is nearly invisible; the behaviour that matters is what happens on a platform
 * nobody has recorded, and that is precisely the case the render suite cannot reach from
 * here. Without this file, the rule the ticket exists to enforce — an unrecorded platform is
 * visible as unrecorded, never silently skipped — would ship untested.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { expectRecordedStill, expectRecordedStills } from './render/still-hashes';

const realPlatform = process.platform;

const pretendPlatform = (platform: string): void => {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
};

afterEach(() => {
  pretendPlatform(realPlatform);
});

describe('recorded still hashes are scoped to a platform', () => {
  it('compares against the set recorded for the running platform', () => {
    pretendPlatform('win32');

    expect(() =>
      expectRecordedStills(
        { canonical: 'aaa', held: 'bbb' },
        {
          win32: { canonical: 'aaa', held: 'bbb' },
          linux: { canonical: 'zzz', held: 'yyy' },
        },
      ),
    ).not.toThrow();
  });

  it('reads the other platform, not this one, when the platform changes', () => {
    pretendPlatform('linux');

    expect(() =>
      expectRecordedStills(
        { canonical: 'zzz' },
        { win32: { canonical: 'aaa' }, linux: { canonical: 'zzz' } },
      ),
    ).not.toThrow();
  });

  /**
   * A real regression still reads as one. Scoping the literals must not soften the failure
   * a moved frame produces, or the seam would have bought honesty with a blind spot.
   */
  it('still fails when a frame moves on a recorded platform', () => {
    pretendPlatform('win32');

    expect(() =>
      expectRecordedStills({ canonical: 'moved' }, { win32: { canonical: 'aaa' } }),
    ).toThrow();
  });

  it('fails with a named reason on a platform that has no recorded set', () => {
    pretendPlatform('linux');

    expect(() =>
      expectRecordedStills({ canonical: 'zzz' }, { win32: { canonical: 'aaa' } }),
    ).toThrowError(/No still hashes are recorded for platform "linux"/);
  });

  it('names the platforms that do have a recorded set', () => {
    pretendPlatform('darwin');

    expect(() =>
      expectRecordedStills({ canonical: 'zzz' }, { win32: { canonical: 'aaa' } }),
    ).toThrowError(/Recorded platforms: win32\./);
  });

  /**
   * The failure has to argue against the shortcut it invites, because the shortcut is one
   * copy-paste away and produces a green suite that has accepted nothing.
   */
  it('tells the reader not to paste the observed hash out of the failure', () => {
    pretendPlatform('linux');

    expect(() =>
      expectRecordedStills({ canonical: 'zzz' }, { win32: { canonical: 'aaa' } }),
    ).toThrowError(/inspecting the frame it\s+names/);
  });

  it('scopes a single recorded frame the same way', () => {
    pretendPlatform('win32');
    expect(() => expectRecordedStill('aaa', { win32: 'aaa' })).not.toThrow();

    pretendPlatform('linux');
    expect(() => expectRecordedStill('aaa', { win32: 'aaa' })).toThrowError(
      /No still hashes are recorded for platform "linux"/,
    );
  });

  it('reports none rather than an empty list when nothing is recorded at all', () => {
    pretendPlatform('linux');

    expect(() => expectRecordedStill('aaa', {})).toThrowError(/Recorded platforms: none\./);
  });
});
