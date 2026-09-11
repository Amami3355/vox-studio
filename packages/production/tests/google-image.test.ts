import { MediaModality } from '@google/genai';
import { describe, expect, it, vi } from 'vitest';
import { imageConsumption, imagePrice } from '../src/image/consumption';
import { createGoogleImageAdapter } from '../src/image/google';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('Google image adapter', () => {
  it('captures image, text and reasoning costs for a paid response, including invalid candidates', async () => {
    const usageMetadata = {
      promptTokenCount: 1000,
      cachedContentTokenCount: 200,
      candidatesTokenCount: 1220,
      candidatesTokensDetails: [
        { modality: MediaModality.IMAGE, tokenCount: 1120 },
        { modality: MediaModality.TEXT, tokenCount: 100 },
      ],
      thoughtsTokenCount: 50,
      totalTokenCount: 2270,
    };
    for (const valid of [true, false]) {
      const generateContent = vi.fn(async () => ({
        usageMetadata,
        candidates: [
          {
            content: {
              parts: valid
                ? [{ inlineData: { data: PNG.toString('base64'), mimeType: 'image/png' } }]
                : [],
            },
          },
        ],
      }));
      const adapter = createGoogleImageAdapter({
        environment: {
          GOOGLE_GENAI_USE_VERTEXAI: 'true',
          GOOGLE_CLOUD_PROJECT: 'test',
          GOOGLE_CLOUD_LOCATION: 'global',
        },
        cloudClientFactory: () => ({ models: { generateContent } }),
        now: () => new Date('2026-09-09T12:00:00Z'),
      });
      const result = await adapter
        .generate({
          prompt: 'PRIVATE PROMPT',
          aspectRatio: '16:9',
          outputMimeType: 'image/png',
          seed: 7,
        })
        .catch((error) => error);
      expect(result.consumption.tokens).toMatchObject({
        input: 1000,
        cached: 200,
        output: 100,
        imageOutput: 1120,
        reasoning: 50,
      });
      expect(result.consumption.estimatedNanoUsd).toBe(137840000);
      expect(JSON.stringify(result.consumption)).not.toContain('PRIVATE');
      expect(generateContent).toHaveBeenCalledTimes(1);
      if (!valid) expect(result.message).toContain('NO_IMAGE');
    }
  });

  it('keeps missing image measurements and unsupported tariffs unknown', () => {
    const identity = {
      provider: 'google-cloud' as const,
      model: 'gemini-3-pro-image',
      location: 'global',
    };
    const price = imagePrice(
      identity.provider,
      identity.model,
      identity.location,
      new Date('2026-09-09T12:00:00Z'),
    );
    expect(imageConsumption(undefined, identity, price).estimatedNanoUsd).toBeNull();
    expect(
      imageConsumption({ promptTokenCount: 100, candidatesTokenCount: 1120 }, identity, price)
        .tokens.imageOutput,
    ).toBeNull();
    expect(
      imageConsumption(
        {
          promptTokenCount: 100,
          candidatesTokenCount: 1120,
          candidatesTokensDetails: [{ modality: MediaModality.IMAGE, tokenCount: 1119 }],
        },
        identity,
        price,
      ).estimatedNanoUsd,
    ).toBeNull();
    for (const [model, location, date] of [
      ['other-model', 'global', '2026-09-09'],
      ['gemini-3-pro-image', 'europe-west1', '2026-09-09'],
      ['gemini-3-pro-image', 'global', '2027-01-01'],
    ]) {
      expect(imagePrice('google-cloud', model!, location!, new Date(date!))).toBeNull();
    }
  });

  it('uses the long-context input tier while retaining the image output rate', () => {
    const identity = {
      provider: 'google-cloud' as const,
      model: 'gemini-3-pro-image',
      location: 'global',
    };
    const price = imagePrice(
      identity.provider,
      identity.model,
      identity.location,
      new Date('2026-09-09T12:00:00Z'),
    );
    const result = imageConsumption(
      {
        promptTokenCount: 200001,
        cachedContentTokenCount: 1,
        candidatesTokenCount: 1121,
        candidatesTokensDetails: [
          { modality: MediaModality.IMAGE, tokenCount: 1120 },
          { modality: MediaModality.TEXT, tokenCount: 1 },
        ],
      },
      identity,
      price,
    );
    expect(result.estimatedNanoUsd).toBe(934418400);
  });

  it.each([undefined, 'image/webp'] as const)(
    'edits verified pixels with their actual MIME type (%s)',
    async (sourceImageMimeType) => {
      const generateContent = vi.fn(async () => ({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data: PNG.toString('base64'), mimeType: 'image/png' } }],
            },
          },
        ],
      }));
      const adapter = createGoogleImageAdapter({
        environment: {},
        keySource: () => 'test-key',
        clientFactory: () => ({ models: { generateContent } }),
      });
      await adapter.generate({
        prompt: 'Remove the upper arcs.',
        aspectRatio: '16:9',
        outputMimeType: 'image/png',
        seed: 7,
        sourceImage: PNG,
        ...(sourceImageMimeType ? { sourceImageMimeType } : {}),
      });
      expect(generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-3-pro-image',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    data: PNG.toString('base64'),
                    mimeType: sourceImageMimeType ?? 'image/png',
                  },
                },
                { text: expect.stringContaining('Remove the upper arcs.') },
              ],
            },
          ],
        }),
      );
      expect(generateContent).toHaveBeenCalledTimes(1);
    },
  );
  it('uses the Production cloud identity without reading or forwarding an API key', async () => {
    const generateContent = vi.fn(async () => ({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { data: PNG.toString('base64'), mimeType: 'image/png' } }],
          },
        },
      ],
    }));
    const cloudClientFactory = vi.fn(() => ({ models: { generateContent } }));
    const keySource = vi.fn(() => 'must-not-be-read');
    const adapter = createGoogleImageAdapter({
      environment: {
        GOOGLE_GENAI_USE_VERTEXAI: 'true',
        GOOGLE_CLOUD_PROJECT: 'test-project',
        GOOGLE_CLOUD_LOCATION: 'europe-west1',
      },
      keySource,
      cloudClientFactory,
    });
    const result = await adapter.generate({
      prompt: 'An illustration.',
      aspectRatio: '16:9',
      outputMimeType: 'image/png',
      seed: 7,
    });
    expect(result.bytes).toEqual(PNG);
    expect(keySource).not.toHaveBeenCalled();
    expect(cloudClientFactory).toHaveBeenCalledWith({
      vertexai: true,
      project: 'test-project',
      location: 'europe-west1',
      httpOptions: { timeout: 180_000, retryOptions: { attempts: 1 } },
    });
  });

  it('refuses incomplete cloud configuration instead of switching to API key billing', async () => {
    const keySource = vi.fn(() => 'must-not-be-read');
    const adapter = createGoogleImageAdapter({
      environment: { GOOGLE_GENAI_USE_VERTEXAI: 'true' },
      keySource,
    });
    await expect(
      adapter.generate({
        prompt: 'An illustration.',
        aspectRatio: '16:9',
        outputMimeType: 'image/png',
        seed: 7,
      }),
    ).rejects.toThrow('GOOGLE_CLOUD_PROJECT');
    expect(keySource).not.toHaveBeenCalled();
  });

  it('maps the seeded request to Gemini and returns normalized bytes and consumption', async () => {
    const generateContent = vi.fn(async () => ({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { data: PNG.toString('base64'), mimeType: 'image/png' } }],
          },
        },
      ],
    }));
    const clientFactory = vi.fn(() => ({ models: { generateContent } }));
    const adapter = createGoogleImageAdapter({
      keySource: () => 'test-key',
      clientFactory,
    });

    const result = await adapter.generate({
      prompt: 'A bounded prompt.',
      aspectRatio: '16:9',
      outputMimeType: 'image/png',
      seed: 7,
    });

    expect(clientFactory).toHaveBeenCalledWith('test-key');
    expect(generateContent).toHaveBeenCalledWith({
      model: 'gemini-3-pro-image',
      contents: 'A bounded prompt.',
      config: {
        candidateCount: 1,
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: '16:9', imageSize: '2K' },
        seed: 7,
      },
    });
    expect(result).toEqual({
      bytes: PNG,
      mediaType: 'image/png',
      consumption: {
        schemaVersion: 1,
        provider: 'gemini-api',
        model: 'gemini-3-pro-image',
        location: 'global',
        tokens: {
          input: null,
          cached: null,
          output: null,
          imageOutput: null,
          reasoning: null,
          tools: null,
          total: null,
        },
        estimatedNanoUsd: null,
        priceVersion: null,
      },
    });
  });

  it.each([
    [],
    [{ inlineData: { data: PNG.toString('base64'), mimeType: 'image/jpeg' } }],
    [{ thought: true, inlineData: { data: PNG.toString('base64'), mimeType: 'image/png' } }],
    [
      { inlineData: { data: PNG.toString('base64'), mimeType: 'image/png' } },
      { inlineData: { data: PNG.toString('base64'), mimeType: 'image/png' } },
    ],
  ])(
    'refuses missing, unsupported, thought-only or multiple images without retrying (%#)',
    async (...parts) => {
      const generateContent = vi.fn(async () => ({ candidates: [{ content: { parts } }] }));
      const adapter = createGoogleImageAdapter({
        environment: {},
        keySource: () => 'test-key',
        clientFactory: () => ({ models: { generateContent } }),
      });
      await expect(
        adapter.generate({
          prompt: 'One illustration.',
          aspectRatio: '16:9',
          outputMimeType: 'image/png',
          seed: 7,
        }),
      ).rejects.toThrow('exactly one PNG');
      expect(generateContent).toHaveBeenCalledTimes(1);
    },
  );

  it('fails before the SDK client exists when the trusted key is missing', async () => {
    const clientFactory = vi.fn();
    const adapter = createGoogleImageAdapter({ keySource: () => undefined, clientFactory });

    await expect(
      adapter.generate({
        prompt: 'A bounded prompt.',
        aspectRatio: '16:9',
        outputMimeType: 'image/png',
        seed: 7,
      }),
    ).rejects.toThrow('GOOGLE_API_KEY');
    expect(clientFactory).not.toHaveBeenCalled();
  });
});
