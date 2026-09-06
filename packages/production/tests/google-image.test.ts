import { describe, expect, it, vi } from 'vitest';
import { createGoogleImageAdapter } from '../src/image/google';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('Google image adapter', () => {
  it('maps the deterministic request through the current SDK and returns only normalized bytes', async () => {
    const generateImages = vi.fn(async () => ({
      generatedImages: [{ image: { imageBytes: PNG.toString('base64'), mimeType: 'image/png' } }],
    }));
    const clientFactory = vi.fn(() => ({ models: { generateImages } }));
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
    expect(generateImages).toHaveBeenCalledWith({
      model: 'imagen-4.0-generate-001',
      prompt: 'A bounded prompt.',
      config: {
        numberOfImages: 1,
        includeRaiReason: true,
        aspectRatio: '16:9',
        outputMimeType: 'image/png',
        seed: 7,
        addWatermark: false,
      },
    });
    expect(result).toEqual({ bytes: PNG, mediaType: 'image/png' });
  });

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
