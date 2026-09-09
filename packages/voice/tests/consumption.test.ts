import { describe, expect, it, vi } from 'vitest';
import { type VoiceSettings, createElevenLabsAdapter } from '../src/synthesise';

const settings: VoiceSettings = {
  provider: 'elevenlabs',
  voiceId: 'fixture',
  modelId: 'eleven_v3',
  seed: 7,
};
const now = () => new Date('2026-09-09T12:00:00Z');
const body = {
  audio_base64: 'SUQz',
  alignment: {
    characters: ['x'],
    character_start_times_seconds: [0],
    character_end_times_seconds: [1],
  },
};

describe('ElevenLabs consumption without live requests', () => {
  it.each([
    ['3000', 3000, 300_000_000],
    ['0', 0, 0],
    [null, null, null],
    ['', null, null],
    ['-1', null, null],
    ['NaN', null, null],
    ['1e3', null, null],
    ['1.5', null, null],
    ['9007199254740992', null, null],
  ])('retains character-cost %s without guessing from text', async (header, characters, price) => {
    const adapter = createElevenLabsAdapter({
      apiKey: 'fixture',
      now,
      fetchImpl: vi.fn(async () =>
        Response.json(body, {
          headers: {
            ...(header === null ? {} : { 'character-cost': header }),
            'request-id': 'request-fixture',
          },
        }),
      ),
    });
    const receipt = vi.fn(async () => {});
    const result = await adapter({ text: 'x', settings }, receipt);
    expect(result.consumption).toMatchObject({
      characterCost: characters,
      estimatedNanoUsd: price,
      requestId: 'request-fixture',
      model: 'eleven_v3',
    });
    expect(receipt).toHaveBeenCalledWith(result.consumption);
  });

  it.each([
    ['eleven_multilingual_v2', '2026-09-09', 300_000_000],
    ['unverified-model', '2026-09-09', null],
    ['eleven_v3', '2027-01-01', null],
  ])('uses the configured model %s and dispatch date %s', async (modelId, day, estimate) => {
    let date = new Date(`${day}T12:00:00Z`);
    const adapter = createElevenLabsAdapter({
      apiKey: 'fixture',
      now: () => date,
      fetchImpl: vi.fn(async () => {
        date = new Date('2028-01-01');
        return Response.json(body, { headers: { 'character-cost': '3000' } });
      }),
    });
    const response = await adapter({ text: 'x', settings: { ...settings, modelId } });
    expect(response.consumption).toMatchObject({
      model: modelId,
      characterCost: 3000,
      estimatedNanoUsd: estimate,
    });
  });

  it.each([200, 500])(
    'awaits durable receipt before reading an invalid HTTP %s body',
    async (status) => {
      const events: string[] = [];
      const response = new Response('{invalid', { status, headers: { 'character-cost': '30' } });
      const read = status === 200 ? 'json' : 'text';
      const original = response[read].bind(response);
      vi.spyOn(response, read).mockImplementation(async () => {
        events.push('body');
        return original();
      });
      const adapter = createElevenLabsAdapter({
        apiKey: 'fixture',
        now,
        fetchImpl: vi.fn(async () => response),
      });
      await expect(
        adapter({ text: 'x', settings }, async () => {
          await Promise.resolve();
          events.push('receipt');
        }),
      ).rejects.toThrow();
      expect(events).toEqual(['receipt', 'body']);
    },
  );
});
