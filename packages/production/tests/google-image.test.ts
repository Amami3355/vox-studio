import { describe, expect, it, vi } from 'vitest';
import { createGoogleImageAdapter } from '../src/image/google';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('Google image adapter', () => {
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

  it('maps the seeded request to Gemini and returns only normalized bytes', async () => {
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
      model: 'gemini-2.5-flash-image',
      contents: 'A bounded prompt.',
      config: {
        candidateCount: 1,
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: '16:9' },
        seed: 7,
      },
    });
    expect(result).toEqual({ bytes: PNG, mediaType: 'image/png' });
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
