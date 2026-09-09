/**
 * The impure half: one call to ElevenLabs, folded into a take.
 *
 * Tests inject HTTP responses; they never reach the live provider.
 * Synthesis is not reproducible — see `RECORDING.md` — so a test that called it
 * could assert almost nothing, would cost quota on every run, and would need a credential
 * ADR-0004 guarantees no contributor needs. What *is* testable is the fold, and the fold
 * is a pure function of a recording.
 *
 * A take is therefore something you **record**, deliberately, and commit. It is not
 * something a build step regenerates.
 */
import type { Beat, TimedBeat } from '@vox/video';
import { type VoiceConsumption, voiceConsumption, voicePriceAtDispatch } from './consumption';
import { type Alignment, foldAlignment, scriptFor } from './fold';

/** ElevenLabs' most expressive model, and the one that returns full character alignment. */
export const MODEL_ID = 'eleven_v3';

/**
 * A ceiling on narration length rather than on timing. Boundaries are offsets into a
 * single alignment array, so two responses cannot be stitched — their offsets have no
 * common origin — and the whole script goes in one call.
 */
export const MAX_SCRIPT_LENGTH = 5000;

export type VoiceSettings = {
  provider: 'elevenlabs';
  voiceId: string;
  modelId: string;
  seed: number;
};

export type ProviderSynthesisRequest = {
  text: string;
  settings: VoiceSettings;
};

export type ProviderSynthesisResponse = {
  audio: Uint8Array;
  alignment: Alignment;
  consumption?: VoiceConsumption;
};

export type SynthesisAdapter = (
  request: ProviderSynthesisRequest,
  onConsumption?: (consumption: VoiceConsumption) => Promise<void>,
) => Promise<ProviderSynthesisResponse>;

export const requestSynthesis = async (
  beats: Beat[],
  settings: VoiceSettings,
  adapter: SynthesisAdapter,
  onConsumption?: (consumption: VoiceConsumption) => Promise<void>,
): Promise<ProviderSynthesisResponse & { script: string }> => {
  const script = scriptFor(beats);
  if (script.length > MAX_SCRIPT_LENGTH) {
    throw new Error(
      `The script is ${script.length} characters, over ${settings.modelId}'s ${MAX_SCRIPT_LENGTH} limit. It cannot be split across two calls: beat boundaries are offsets into one alignment array.`,
    );
  }
  const request = { text: script, settings };
  const response = await (onConsumption ? adapter(request, onConsumption) : adapter(request));
  return { ...response, script };
};

export const createElevenLabsAdapter = ({
  apiKey,
  fetchImpl = fetch,
  now = () => new Date(),
}: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): SynthesisAdapter => {
  if (!apiKey) throw new Error('ElevenLabs adapter requires a service-side API key.');
  return async ({ text, settings }, onConsumption) => {
    if (settings.provider !== 'elevenlabs')
      throw new Error(`Unsupported provider: ${settings.provider}`);
    const price = voicePriceAtDispatch(settings.modelId, now());
    const response = await fetchImpl(
      `https://api.elevenlabs.io/v1/text-to-speech/${settings.voiceId}/with-timestamps`,
      {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ text, model_id: settings.modelId, seed: settings.seed }),
      },
    );
    const consumption = voiceConsumption(response.headers, settings.modelId, price);
    // Persist headers before reading/decoding the body, including error responses.
    await onConsumption?.(consumption);
    if (!response.ok) {
      throw new Error(`ElevenLabs returned ${response.status}: ${await response.text()}`);
    }
    const body = (await response.json()) as { audio_base64: string; alignment: Alignment };
    return {
      audio: Buffer.from(body.audio_base64, 'base64'),
      alignment: body.alignment,
      consumption,
    };
  };
};

export type SynthesisRequest = {
  beats: Beat[];
  voiceId: string;
  /**
   * Pins the synthesiser much closer, and not all the way: a seeded pair was measured
   * agreeing on every beat boundary in one run and differing by 80ms at the tail in
   * another. Worth sending so a re-record is comparable; never worth trusting as equality.
   */
  seed?: number;
  apiKey?: string;
};

/**
 * What one call returns. The audio is bytes because it has no home yet — it becomes
 * ADR-0004's `VoiceTake` once written somewhere the Asset Resolver can name.
 *
 * The raw `alignment` comes back too, and not as a debugging courtesy: it is the only
 * artifact a test can be written against, so a recorder has to be able to commit the exact
 * array this take returned. Handing back the fold alone would leave the fixture to be
 * produced by a second call, which is precisely the two-takes-one-video failure.
 */
export type SynthesisedTake = {
  beats: TimedBeat[];
  audio: Uint8Array;
  script: string;
  alignment: Alignment;
};

export const synthesise = async ({
  beats,
  voiceId,
  seed,
  apiKey = process.env.ELEVENLABS_API_KEY,
}: SynthesisRequest): Promise<SynthesisedTake> => {
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not set. Synthesis is the one step that needs it.');
  }

  const settings: VoiceSettings = {
    provider: 'elevenlabs',
    voiceId,
    modelId: MODEL_ID,
    seed: seed ?? 7,
  };
  const response = await requestSynthesis(beats, settings, createElevenLabsAdapter({ apiKey }));

  return {
    beats: foldAlignment(beats, response.alignment),
    audio: response.audio,
    script: response.script,
    alignment: response.alignment,
  };
};
