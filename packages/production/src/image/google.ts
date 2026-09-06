import { GoogleGenAI } from '@google/genai';
import type { ImageGenerationAdapter } from '../commands/service';

type GoogleImageClient = {
  models: {
    generateImages(input: {
      model: string;
      prompt: string;
      config: {
        numberOfImages: number;
        includeRaiReason: boolean;
        aspectRatio: string;
        outputMimeType: string;
        seed: number;
        addWatermark: boolean;
      };
    }): Promise<{
      generatedImages?: Array<{
        image?: { imageBytes?: string; mimeType?: string };
      }>;
    }>;
  };
};

export type GoogleImageAdapterOptions = {
  keySource?: () => string | undefined;
  model?: string;
  clientFactory?: (apiKey: string) => GoogleImageClient;
};

/** Provider names, credentials and response bodies stop at this trusted adapter. */
export const createGoogleImageAdapter = (
  options: GoogleImageAdapterOptions = {},
): ImageGenerationAdapter => ({
  mode: 'live',
  generate: async (request) => {
    const apiKey = (options.keySource ?? (() => process.env.GOOGLE_API_KEY))();
    if (!apiKey) throw new Error('GOOGLE_API_KEY is required for live image generation.');
    const client = options.clientFactory?.(apiKey) ?? new GoogleGenAI({ apiKey });
    const response = await client.models.generateImages({
      model: options.model ?? 'imagen-4.0-generate-001',
      prompt: request.prompt,
      config: {
        numberOfImages: 1,
        includeRaiReason: true,
        aspectRatio: request.aspectRatio,
        outputMimeType: request.outputMimeType,
        seed: request.seed,
        addWatermark: false,
      },
    });
    const image = response.generatedImages?.[0]?.image;
    if (!image?.imageBytes || image.mimeType !== 'image/png') {
      throw new Error('The image provider returned no PNG candidate.');
    }
    return { bytes: Buffer.from(image.imageBytes, 'base64'), mediaType: 'image/png' };
  },
});
