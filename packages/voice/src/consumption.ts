/** Provider observations and a frozen public API price; never an invoice. */
export type VoiceConsumption = {
  schemaVersion: 1;
  provider: 'elevenlabs';
  model: string;
  requestId: string | null;
  characterCost: number | null;
  estimatedNanoUsd: number | null;
  priceVersion: string | null;
};

export const VOICE_PRICE_SOURCE = 'https://elevenlabs.io/pricing/api';
export const VOICE_PRICE_CHECKED = '2026-09-09';

export const voicePriceAtDispatch = (model: string, now: Date): number | null => {
  const day = now.toISOString().slice(0, 10);
  // Other models remain unpriced until their character-cost conversion is verified.
  return day >= VOICE_PRICE_CHECKED &&
    day < '2027-01-01' &&
    ['eleven_v3', 'eleven_multilingual_v2'].includes(model)
    ? 100_000 // $0.10 / 1,000 provider-reported characters, in nano-USD.
    : null;
};

export const voiceConsumption = (
  headers: Headers,
  model: string,
  price: number | null,
): VoiceConsumption => {
  const raw = headers.get('character-cost')?.trim();
  const parsed = raw && /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  const characterCost = Number.isSafeInteger(parsed) ? parsed : null;
  const estimate = characterCost !== null && price !== null ? characterCost * price : null;
  const estimatedNanoUsd = Number.isSafeInteger(estimate) ? estimate : null;
  return {
    schemaVersion: 1,
    provider: 'elevenlabs',
    model,
    requestId: headers.get('request-id')?.trim() || null,
    characterCost,
    estimatedNanoUsd,
    priceVersion: price === null ? null : `elevenlabs-api-characters-${VOICE_PRICE_CHECKED}`,
  };
};
