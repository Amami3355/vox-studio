import type { GenerateContentResponseUsageMetadata } from '@google/genai';
import type { ImageConsumption } from '../contracts/schemas';

/** Snapshot the published global standard tariff before sending a paid request.
 * Source: https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing
 * Checked 2026-09-09. Rates expire rather than silently pricing future calls.
 */
export const imagePrice = (provider: string, model: string, location: string, date: Date) =>
  provider === 'google-cloud' &&
  model === 'gemini-3-pro-image' &&
  location === 'global' &&
  date.toISOString().slice(0, 10) >= '2026-09-09' &&
  date.toISOString().slice(0, 10) < '2027-01-01'
    ? {
        version: 'google-image-global-standard-2026-09-09',
        input: 2000,
        cached: 200,
        output: 12000,
        longInput: 4000,
        longCached: 400,
        longOutput: 18000,
        image: 120000,
      }
    : null;

const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

export function imageConsumption(
  metadata: GenerateContentResponseUsageMetadata | undefined,
  identity: Pick<ImageConsumption, 'provider' | 'model' | 'location'>,
  price: ReturnType<typeof imagePrice>,
): ImageConsumption {
  const details = metadata?.candidatesTokensDetails;
  let imageOutput: number | null = null;
  let textOutput: number | null = null;
  const candidates = count(metadata?.candidatesTokenCount);
  // Only a complete modality breakdown distinguishes image and text rates reliably.
  if (
    details?.length &&
    candidates !== null &&
    details.every(
      (item) => ['TEXT', 'IMAGE'].includes(item.modality ?? '') && count(item.tokenCount) !== null,
    ) &&
    details.reduce((sum, item) => sum + item.tokenCount!, 0) === candidates
  ) {
    imageOutput = details
      .filter((item) => item.modality === 'IMAGE')
      .reduce((sum, item) => sum + item.tokenCount!, 0);
    textOutput = candidates - imageOutput;
  }
  const tokens: ImageConsumption['tokens'] = {
    input: count(metadata?.promptTokenCount),
    cached: metadata ? count(metadata.cachedContentTokenCount ?? 0) : null,
    output: textOutput,
    imageOutput,
    reasoning: metadata ? count(metadata.thoughtsTokenCount ?? 0) : null,
    tools: metadata ? count(metadata.toolUsePromptTokenCount ?? 0) : null,
    total: count(metadata?.totalTokenCount),
  };
  let estimatedNanoUsd: number | null = null;
  if (
    price &&
    (!metadata?.trafficType || metadata.trafficType === 'ON_DEMAND') &&
    tokens.input !== null &&
    tokens.cached !== null &&
    tokens.cached <= tokens.input &&
    tokens.output !== null &&
    tokens.imageOutput !== null &&
    tokens.reasoning !== null &&
    tokens.tools === 0
  ) {
    const long = tokens.input > 200000;
    const estimate =
      (tokens.input - tokens.cached) * (long ? price.longInput : price.input) +
      tokens.cached * (long ? price.longCached : price.cached) +
      (tokens.output + tokens.reasoning) * (long ? price.longOutput : price.output) +
      tokens.imageOutput * price.image;
    estimatedNanoUsd = count(estimate);
  }
  return {
    schemaVersion: 1,
    ...identity,
    tokens,
    estimatedNanoUsd,
    priceVersion: estimatedNanoUsd === null ? null : price!.version,
  };
}
