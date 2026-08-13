/**
 * Take identity: the binding that makes three files one artifact.
 *
 * A take is a recording, its alignment, and the beats folded from them. CONTEXT.md says
 * they are one thing and that swapping any of them alone cuts the video against words the
 * audio does not say. Until now that was enforced socially. The fold test ties the beats to
 * the alignment and text equality ties the beats to the plan, so the two *derived*
 * artifacts are checked against each other — and the one artifact nothing can be
 * re-derived from, the audio, was checked against nothing at all.
 *
 * That is not a hypothetical. `refold.mts` rewrites the beats from the committed alignment
 * and never opens the mp3, so a cherry-pick or a partial revert that takes one file and not
 * the other leaves alignment from take B beside audio from take A. Refold then makes the
 * beats agree with B. Every mechanical check in the repository still passes, and the only
 * way to discover it is to watch the video.
 *
 * Hashes cannot make a mismatched set match — nothing can, short of recording again. What
 * they can do is refuse to let a *derived* artifact be written from a set that does not
 * agree, which is the one move available to a script that cannot re-record.
 *
 * Pure on purpose: it takes bytes and an alignment, never a path. Nothing here reads the
 * disk, so the whole binding is testable without a recording, a credential or any quota.
 */
import { createHash } from 'node:crypto';
import type { Alignment } from './fold';

/** The two artifacts a take cannot re-derive, and what identifies them. */
export type TakeManifest = {
  /**
   * A digest of the pair, not a label beside it. A hand-written id or a timestamp is a
   * *claim* about which take this is and survives a splice unchanged; a digest of the two
   * artifacts **is** which take this is, and a spliced pair simply has a different one.
   */
  takeId: string;
  planId: string;
  voiceId: string;
  seed?: number;
  recordedAt: string;
  audio: { bytes: number; sha256: string };
  alignment: { characters: number; sha256: string };
};

export type TakeArtifacts = { audio: Uint8Array; alignment: Alignment };

/**
 * A set of artifacts that were not recorded together, refused.
 *
 * Its own error type, as `AlignmentMismatchError` is, and for the same reason: the only
 * repair is to restore the missing half or to record again, and neither is something a
 * script may decide to do on a caller's behalf.
 */
export class TakeMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TakeMismatchError';
  }
}

const digest = (data: Uint8Array | string): string =>
  createHash('sha256').update(data).digest('hex');

/**
 * The alignment, hashed as the canonical JSON of the three arrays that matter.
 *
 * Serialised field by field rather than with `JSON.stringify(alignment)`, because key order
 * and any field a provider adds later would change the hash without changing a single
 * timing — and a binding that reports drift when nothing drifted is one people learn to
 * ignore.
 */
const alignmentDigest = (alignment: Alignment): string =>
  digest(
    JSON.stringify([
      alignment.characters,
      alignment.character_start_times_seconds,
      alignment.character_end_times_seconds,
    ]),
  );

export const takeManifest = ({
  planId,
  voiceId,
  seed,
  recordedAt,
  audio,
  alignment,
}: {
  planId: string;
  voiceId: string;
  seed?: number;
  recordedAt: string;
} & TakeArtifacts): TakeManifest => {
  const audioSha = digest(audio);
  const alignmentSha = alignmentDigest(alignment);

  return {
    takeId: digest(`${audioSha}:${alignmentSha}`).slice(0, 12),
    planId,
    voiceId,
    ...(seed === undefined ? {} : { seed }),
    recordedAt,
    audio: { bytes: audio.byteLength, sha256: audioSha },
    alignment: { characters: alignment.characters.length, sha256: alignmentSha },
  };
};

/**
 * The artifacts on disk, held against the manifest that says what was recorded.
 *
 * Both halves are reported rather than the first one that fails, and the message names
 * which drifted, because the two repairs are opposite: a stale mp3 is fixed by restoring
 * the audio and a stale alignment by restoring the alignment. A caller told only that
 * "something does not match" has an even chance of destroying the good half.
 */
export const verifyTake = (manifest: TakeManifest, artifacts: TakeArtifacts): void => {
  const drifted: string[] = [];

  const audioSha = digest(artifacts.audio);
  if (audioSha !== manifest.audio.sha256) {
    drifted.push(
      `the audio does not match: take ${manifest.takeId} was recorded with ${manifest.audio.sha256.slice(0, 12)} (${manifest.audio.bytes} bytes), and the committed mp3 is ${audioSha.slice(0, 12)} (${artifacts.audio.byteLength} bytes)`,
    );
  }

  const alignmentSha = alignmentDigest(artifacts.alignment);
  if (alignmentSha !== manifest.alignment.sha256) {
    drifted.push(
      `the alignment does not match: take ${manifest.takeId} was recorded with ${manifest.alignment.sha256.slice(0, 12)} (${manifest.alignment.characters} characters), and the committed alignment is ${alignmentSha.slice(0, 12)} (${artifacts.alignment.characters.length} characters)`,
    );
  }

  if (drifted.length === 0) return;

  throw new TakeMismatchError(
    `The take's artifacts were not recorded together — ${drifted.join('; and ')}. A take is one recording: its audio, its alignment and the beats folded from them. Deriving anything from a set that disagrees produces timings for words the audio does not say, at no point failing anything. Restore the artifact that drifted from the commit that wrote this manifest, or record the take again with \`pnpm exec tsx scripts/record-take.mts\`.`,
  );
};

/** One line a human can put in a commit message, or read in a script's output. */
export const describeTake = (manifest: TakeManifest): string =>
  `take ${manifest.takeId} of "${manifest.planId}" — voice ${manifest.voiceId}` +
  `${manifest.seed === undefined ? '' : `, seed ${manifest.seed}`}, recorded ${manifest.recordedAt}, ` +
  `${manifest.audio.bytes} bytes of audio over ${manifest.alignment.characters} characters`;
