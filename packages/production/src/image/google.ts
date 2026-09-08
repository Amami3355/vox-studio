import {
  type GenerateContentParameters,
  GoogleGenAI,
  type GoogleGenAIOptions,
} from '@google/genai';
import type { ImageGenerationAdapter } from '../commands/service';

type GoogleImageClient = {
  models: {
    generateContent(input: GenerateContentParameters): Promise<{
      candidates?: Array<{
        content?: {
          parts?: Array<{
            thought?: boolean;
            inlineData?: { data?: string; mimeType?: string };
          }>;
        };
      }>;
    }>;
  };
};

export type GoogleImageAdapterOptions = {
  keySource?: () => string | undefined;
  model?: string;
  clientFactory?: (apiKey: string) => GoogleImageClient;
  cloudClientFactory?: (options: GoogleGenAIOptions) => GoogleImageClient;
  environment?: Record<string, string | undefined>;
};

/** Provider names, credentials and response bodies stop at this trusted adapter. */
export const createGoogleImageAdapter = (
  options: GoogleImageAdapterOptions = {},
): ImageGenerationAdapter => ({
  mode: 'live',
  generate: async (request) => {
    const environment = options.environment ?? process.env;
    const cloud =
      environment.GOOGLE_GENAI_USE_VERTEXAI?.toLowerCase() === 'true' ||
      environment.GOOGLE_GENAI_USE_ENTERPRISE?.toLowerCase() === 'true';
    let client: GoogleImageClient;
    if (cloud) {
      const project = environment.GOOGLE_CLOUD_PROJECT;
      const location = environment.GOOGLE_CLOUD_LOCATION;
      if (!project || !location) {
        throw new Error(
          'GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION are required for cloud images.',
        );
      }
      const configuration: GoogleGenAIOptions = {
        vertexai: true,
        project,
        location,
        httpOptions: { timeout: 180_000, retryOptions: { attempts: 1 } },
      };
      client = options.cloudClientFactory?.(configuration) ?? new GoogleGenAI(configuration);
    } else {
      const apiKey = (options.keySource ?? (() => environment.GOOGLE_API_KEY))();
      if (!apiKey) throw new Error('GOOGLE_API_KEY is required for live image generation.');
      client =
        options.clientFactory?.(apiKey) ??
        new GoogleGenAI({
          apiKey,
          httpOptions: { timeout: 180_000, retryOptions: { attempts: 1 } },
        });
    }
    const response = await client.models.generateContent({
      model: options.model ?? 'gemini-2.5-flash-image',
      contents: request.prompt,
      config: {
        candidateCount: 1,
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: request.aspectRatio },
        seed: request.seed,
      },
    });
    const images =
      response.candidates?.flatMap((candidate) =>
        (candidate.content?.parts ?? [])
          .filter((part) => !part.thought && part.inlineData)
          .map((part) => part.inlineData!),
      ) ?? [];
    const image = images[0];
    if (images.length !== 1 || !image?.data || image.mimeType !== 'image/png') {
      throw new Error('The image provider must return exactly one PNG candidate.');
    }
    return { bytes: Buffer.from(image.data, 'base64'), mediaType: 'image/png' };
  },
});
