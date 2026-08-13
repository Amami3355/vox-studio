import type { Beat } from '@vox/video';
import { describe, expect, it, vi } from 'vitest';
import {
  beatShapeIdentity,
  recordingInputIdentity,
  takeIdentity,
} from '../../production/src/run-store/identities';
import { type Alignment, scriptFor } from '../src/fold';
import { createRunTake, foldRunTake, verifyRunTake, verifyTimedBeatFold } from '../src/run-take';
import { type SynthesisAdapter, type VoiceSettings, requestSynthesis } from '../src/synthesise';

const beats: Beat[] = [
  { id: 'b1', text: 'Northbridge waits.' },
  { id: 'b2', text: 'The last bus arrives.' },
];

const voice: VoiceSettings = {
  provider: 'elevenlabs',
  voiceId: 'JBFqnCBsd6RMkjVDRZzb',
  modelId: 'eleven_v3',
  seed: 7,
};

const alignmentFor = (source: Beat[]): Alignment => {
  const characters = scriptFor(source).split('');
  return {
    characters,
    character_start_times_seconds: characters.map((_, index) => index * 0.05),
    character_end_times_seconds: characters.map((_, index) => (index + 1) * 0.05),
  };
};

describe('arbitrary Run Take production', () => {
  it('passes complete public voice settings to an injected credential-owning adapter', async () => {
    const adapter = vi.fn<SynthesisAdapter>(async () => ({
      audio: Buffer.from('ID3 provider response'),
      alignment: alignmentFor(beats),
    }));
    const response = await requestSynthesis(beats, voice, adapter);

    expect(adapter).toHaveBeenCalledOnce();
    expect(adapter).toHaveBeenCalledWith({ text: scriptFor(beats), settings: voice });
    expect(response.script).toBe(scriptFor(beats));
    expect(JSON.stringify(adapter.mock.calls)).not.toContain('apiKey');
  });

  it('turns one provider response into multiple quota-free Beat-id folds', async () => {
    let dispatches = 0;
    const adapter: SynthesisAdapter = async () => {
      dispatches += 1;
      return { audio: Buffer.from('ID3 one response'), alignment: alignmentFor(beats) };
    };
    const response = await requestSynthesis(beats, voice, adapter);
    const take = createRunTake({
      beats,
      voice,
      response,
      recordedAt: '2026-08-13T12:00:00.000Z',
    });
    const renamed = beats.map((beat, index) => ({ ...beat, id: `renamed-${index + 1}` }));
    const first = foldRunTake(take.manifest, take.artifacts, beats);
    const second = foldRunTake(take.manifest, take.artifacts, renamed);

    expect(dispatches).toBe(1);
    expect(second.takeSha256).toBe(first.takeSha256);
    expect(second.beatShapeSha256).not.toBe(first.beatShapeSha256);
    expect(second.timedBeats.map((beat) => beat.id)).toEqual(['renamed-1', 'renamed-2']);
  });

  it('uses the same purpose-tagged identity domains as the Run store', async () => {
    const response = {
      audio: Buffer.from('ID3 identity'),
      alignment: alignmentFor(beats),
      script: scriptFor(beats),
    };
    const take = createRunTake({
      beats,
      voice,
      response,
      recordedAt: '2026-08-13T12:00:00.000Z',
    });
    const request = {
      protocolVersion: 1 as const,
      brief: { id: 'brief', text: 'Intent.' },
      production: { voice, maxNewTakes: 1 },
    };

    expect(take.manifest.recordingInputSha256).toBe(
      recordingInputIdentity({ beats, sections: [] }, request),
    );
    expect(take.manifest.takeSha256).toBe(
      takeIdentity(take.manifest.audio.sha256, take.manifest.alignment.sha256),
    );
    expect(foldRunTake(take.manifest, take.artifacts, beats).beatShapeSha256).toBe(
      beatShapeIdentity({ beats, sections: [] }),
    );
  });

  it('refuses spliced media, changed text and changed segmentation before folding', () => {
    const take = createRunTake({
      beats,
      voice,
      response: { audio: Buffer.from('ID3 original'), alignment: alignmentFor(beats) },
      recordedAt: '2026-08-13T12:00:00.000Z',
    });

    expect(() =>
      verifyRunTake(take.manifest, { ...take.artifacts, audio: Buffer.from('ID3 spliced') }, beats),
    ).toThrow(/audio/);
    expect(() =>
      verifyRunTake(take.manifest, take.artifacts, [beats[0]!, { ...beats[1]!, text: 'Changed.' }]),
    ).toThrow(/recording input|text/);
    expect(() =>
      verifyRunTake(take.manifest, take.artifacts, [
        { id: 'merged', text: beats.map((beat) => beat.text).join(' ') },
      ]),
    ).toThrow(/recording input|segmentation/);
  });

  it('refuses a stale or hand-edited fold at the next consumer boundary', () => {
    const take = createRunTake({
      beats,
      voice,
      response: { audio: Buffer.from('ID3 fold'), alignment: alignmentFor(beats) },
      recordedAt: '2026-08-13T12:00:00.000Z',
    });
    const fold = foldRunTake(take.manifest, take.artifacts, beats);
    fold.timedBeats[0]!.toMs += 1;

    expect(() => verifyTimedBeatFold(fold, take.manifest, take.artifacts, beats)).toThrow(
      'RUN_TAKE_FOLD_MISMATCH',
    );
  });
});
