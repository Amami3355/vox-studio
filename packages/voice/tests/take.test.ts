/**
 * The binding that makes a take's three artifacts one artifact.
 *
 * "Swap any of them alone and the video is cut against words the audio does not say" has
 * been true, written down, and enforced by nothing but care since ADR-0004. The fold test
 * compares beats against the alignment, and text equality compares beats against the plan —
 * so the two *derived* artifacts are tied to each other, and the recording neither of them
 * can be re-derived from is tied to nothing.
 *
 * The gap has a shape: `refold.mts` rewrites the beats from the committed alignment without
 * ever opening the mp3. A cherry-pick, a partial revert, or a merge that took one file and
 * not the other leaves alignment from take B beside audio from take A, and refold then
 * makes the beats agree with B — producing a systematically mistimed video whose every
 * mechanical check passes, findable only by watching it.
 *
 * A hash cannot make the artifacts match. It can refuse to let a derived one be written
 * from a set that does not, which is the only move available to something that cannot
 * re-record.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type TakeManifest,
  TakeMismatchError,
  describeTake,
  takeManifest,
  verifyTake,
} from '../src/take';

const audio = Buffer.from('ID3 pretend this is an mp3');
const alignment = {
  characters: ['a', ' ', 'b'],
  character_start_times_seconds: [0, 0.1, 0.2],
  character_end_times_seconds: [0.1, 0.2, 0.3],
};

const manifest = takeManifest({
  planId: 'vertical-slice',
  voiceId: 'JBFqnCBsd6RMkjVDRZzb',
  seed: 7,
  recordedAt: '2026-08-13T00:00:00.000Z',
  audio,
  alignment,
});

describe('takeManifest', () => {
  it('accepts the artifacts it was built from', () => {
    expect(() => verifyTake(manifest, { audio, alignment })).not.toThrow();
  });

  /**
   * The identity is the content, not a label beside it. A take id someone types, or a
   * timestamp, is a claim about which take this is; a digest of the two artifacts *is*
   * which take this is, and cannot survive a splice that a hand-written id would.
   */
  it('gives two different recordings two different ids', () => {
    const other = takeManifest({ ...fields, audio: Buffer.from('a different recording') });

    expect(other.takeId).not.toEqual(manifest.takeId);
  });

  it('gives the same recording the same id, so a re-run is not a new take', () => {
    expect(takeManifest(fields).takeId).toEqual(manifest.takeId);
  });

  /** The finding's own scenario: alignment from take B beside audio from take A. */
  it('refuses audio the manifest was not recorded with', () => {
    const fromAnotherTake = Buffer.from('ID3 a different recording entirely');

    expect(() => verifyTake(manifest, { audio: fromAnotherTake, alignment })).toThrow(
      TakeMismatchError,
    );
  });

  it('refuses an alignment the manifest was not recorded with', () => {
    const fromAnotherTake = { ...alignment, character_start_times_seconds: [0, 0.4, 0.9] };

    expect(() => verifyTake(manifest, { audio, alignment: fromAnotherTake })).toThrow(
      TakeMismatchError,
    );
  });

  /**
   * Which artifact drifted decides what a human does next, and they are opposite actions:
   * a stale mp3 is repaired by restoring the audio, a stale alignment by restoring the
   * alignment, and guessing wrong destroys the good half of the pair.
   */
  it('says which artifact drifted, because the repairs are opposite', () => {
    const wrongAudio = () => verifyTake(manifest, { audio: Buffer.from('x'), alignment });

    expect(wrongAudio).toThrow(/audio/i);
    expect(wrongAudio).not.toThrow(/alignment does not/i);
  });

  /** A take nobody can name is a take nobody can talk about in a commit message. */
  it('describes itself in one line, for the human who has to decide', () => {
    expect(describeTake(manifest)).toContain(manifest.takeId);
    expect(describeTake(manifest)).toContain('vertical-slice');
  });
});

const fields = {
  planId: 'vertical-slice',
  voiceId: 'JBFqnCBsd6RMkjVDRZzb',
  seed: 7,
  recordedAt: '2026-08-13T00:00:00.000Z',
  audio,
  alignment,
};

/**
 * The committed take, held to its own manifest.
 *
 * `refold.mts` verifies before it writes, but that only protects someone who runs it — and
 * the way this goes wrong is a merge or a cherry-pick, which is precisely the moment nobody
 * is refolding. The check has to be a standing test or it is a check against the one
 * failure mode that does not happen.
 *
 * It reads the mp3, which no other test does. That is the point: the audio is the artifact
 * nothing can re-derive and therefore the one nothing else can speak for. `fold.test.ts`
 * ties the beats to the alignment and text equality ties them to the plan; this is the only
 * assertion in the repository that the recording belongs to the set at all.
 */
describe('the committed take', () => {
  const fixtures = join(import.meta.dirname, 'fixtures');
  const shipped = JSON.parse(
    readFileSync(join(fixtures, 'vertical-slice.take.json'), 'utf8'),
  ) as TakeManifest;

  it('is the audio and the alignment its manifest was recorded from', () => {
    const onDisk = {
      audio: readFileSync(
        join(import.meta.dirname, '..', '..', 'video', 'public', 'vertical-slice.vo.mp3'),
      ),
      alignment: JSON.parse(
        readFileSync(join(fixtures, 'vertical-slice.alignment.json'), 'utf8'),
      ) as typeof alignment,
    };

    expect(() => verifyTake(shipped, onDisk)).not.toThrow();
  });
});
