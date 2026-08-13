import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Beat, TimedBeat } from '@vox/video';
import { type Alignment, foldAlignment, scriptFor } from './fold';
import type { ProviderSynthesisResponse, VoiceSettings } from './synthesise';

const digest = (bytes: Uint8Array | string): string =>
  createHash('sha256').update(bytes).digest('hex');

const taggedDigest = (purpose: string, canonicalValue: string): string =>
  digest(`{"protocolVersion":1,"purpose":${JSON.stringify(purpose)},"value":${canonicalValue}}`);

const canonicalVoice = (voice: VoiceSettings): string =>
  JSON.stringify({
    modelId: voice.modelId,
    provider: voice.provider,
    seed: voice.seed,
    voiceId: voice.voiceId,
  });

const recordingInputSha256 = (beatTexts: string[], voice: VoiceSettings): string =>
  taggedDigest(
    'recording-input',
    `{"beatTexts":${JSON.stringify(beatTexts)},"voice":${canonicalVoice(voice)}}`,
  );

const alignmentSha256 = (alignment: Alignment): string =>
  digest(
    JSON.stringify({
      character_end_times_seconds: alignment.character_end_times_seconds,
      character_start_times_seconds: alignment.character_start_times_seconds,
      characters: alignment.characters,
    }),
  );

const fullTakeSha256 = (audioSha256: string, alignmentSha: string): string =>
  taggedDigest(
    'take',
    `{"alignmentSha256":${JSON.stringify(alignmentSha)},"audioSha256":${JSON.stringify(audioSha256)}}`,
  );

export const beatShapeSha256 = (beats: Beat[]): string =>
  taggedDigest('beat-shape', JSON.stringify(beats.map(({ id, text }) => ({ id, text }))));

export type RunTakeManifest = {
  manifestVersion: 1;
  recordedAt: string;
  voice: VoiceSettings;
  beatTexts: string[];
  recordingInputSha256: string;
  takeId: string;
  takeSha256: string;
  audio: { bytes: number; sha256: string };
  alignment: { characters: number; sha256: string };
};

export type RunTakeArtifacts = {
  audio: Uint8Array;
  alignment: Alignment;
};

export type TimedBeatFold = {
  foldVersion: 1;
  takeSha256: string;
  beatShapeSha256: string;
  timedBeats: TimedBeat[];
};

export const createRunTake = ({
  beats,
  voice,
  response,
  recordedAt,
}: {
  beats: Beat[];
  voice: VoiceSettings;
  response: ProviderSynthesisResponse;
  recordedAt: string;
}): { manifest: RunTakeManifest; artifacts: RunTakeArtifacts } => {
  // This validates exact text, segmentation offsets and every time array before publication.
  foldAlignment(beats, response.alignment);
  const audioSha = digest(response.audio);
  const alignmentSha = alignmentSha256(response.alignment);
  const takeSha256 = fullTakeSha256(audioSha, alignmentSha);
  return {
    manifest: {
      manifestVersion: 1,
      recordedAt,
      voice,
      beatTexts: beats.map((beat) => beat.text),
      recordingInputSha256: recordingInputSha256(
        beats.map((beat) => beat.text),
        voice,
      ),
      takeId: takeSha256.slice(0, 12),
      takeSha256,
      audio: { bytes: response.audio.byteLength, sha256: audioSha },
      alignment: { characters: response.alignment.characters.length, sha256: alignmentSha },
    },
    artifacts: { audio: response.audio, alignment: response.alignment },
  };
};

export const verifyRunTake = (
  manifest: RunTakeManifest,
  artifacts: RunTakeArtifacts,
  beats: Beat[],
  voice: VoiceSettings = manifest.voice,
): void => {
  const failures: string[] = [];
  const expectedRecordingInput = recordingInputSha256(
    beats.map((beat) => beat.text),
    voice,
  );
  if (manifest.recordingInputSha256 !== expectedRecordingInput) failures.push('recording input');
  if (JSON.stringify(manifest.beatTexts) !== JSON.stringify(beats.map((beat) => beat.text))) {
    failures.push('text or segmentation');
  }
  const audioSha = digest(artifacts.audio);
  if (audioSha !== manifest.audio.sha256 || artifacts.audio.byteLength !== manifest.audio.bytes) {
    failures.push('audio');
  }
  const alignmentSha = alignmentSha256(artifacts.alignment);
  if (
    alignmentSha !== manifest.alignment.sha256 ||
    artifacts.alignment.characters.length !== manifest.alignment.characters
  ) {
    failures.push('alignment');
  }
  const takeSha = fullTakeSha256(audioSha, alignmentSha);
  if (takeSha !== manifest.takeSha256 || manifest.takeId !== takeSha.slice(0, 12))
    failures.push('Take identity');
  try {
    foldAlignment(beats, artifacts.alignment);
  } catch {
    failures.push('alignment text');
  }
  if (failures.length > 0) {
    throw new Error(`RUN_TAKE_MISMATCH: ${[...new Set(failures)].join(', ')}`);
  }
};

export const foldRunTake = (
  manifest: RunTakeManifest,
  artifacts: RunTakeArtifacts,
  beats: Beat[],
): TimedBeatFold => {
  verifyRunTake(manifest, artifacts, beats);
  return {
    foldVersion: 1,
    takeSha256: manifest.takeSha256,
    beatShapeSha256: beatShapeSha256(beats),
    timedBeats: foldAlignment(beats, artifacts.alignment),
  };
};

export const verifyTimedBeatFold = (
  fold: TimedBeatFold,
  manifest: RunTakeManifest,
  artifacts: RunTakeArtifacts,
  beats: Beat[],
): void => {
  const expected = foldRunTake(manifest, artifacts, beats);
  if (!isDeepStrictEqual(fold, expected)) throw new Error('RUN_TAKE_FOLD_MISMATCH');
};

export const responseMatchesScript = (
  beats: Beat[],
  response: ProviderSynthesisResponse,
): boolean => response.alignment.characters.join('') === scriptFor(beats);
