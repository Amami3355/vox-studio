import type { VideoPlan } from '@vox/video';
import { type JsonValue, hashCanonicalJson } from '../canonical-json';
import type { ProductionRequest } from '../contracts/schemas';

const json = (value: unknown): JsonValue => value as JsonValue;

export const planIdentity = (plan: VideoPlan): string => hashCanonicalJson('plan', json(plan));

export const recordingInputOf = (plan: VideoPlan, request: ProductionRequest) => ({
  beatTexts: plan.beats.map((beat) => beat.text),
  voice: request.production.voice,
});

export const recordingInputIdentity = (plan: VideoPlan, request: ProductionRequest): string =>
  hashCanonicalJson('recording-input', json(recordingInputOf(plan, request)));

export const takeIdentity = (audioSha256: string, alignmentSha256: string): string =>
  hashCanonicalJson('take', { audioSha256, alignmentSha256 });

export const takeIdOf = (takeSha256: string): string => takeSha256.slice(0, 12);

export const beatShapeIdentity = (plan: VideoPlan): string =>
  hashCanonicalJson(
    'beat-shape',
    plan.beats.map(({ id, text }) => ({ id, text })),
  );

export const validationInputIdentity = (input: JsonValue): string =>
  hashCanonicalJson('validation-input', input);

export const preflightInputIdentity = (input: JsonValue): string =>
  hashCanonicalJson('preflight-input', input);

export const compileInputIdentity = (input: JsonValue): string =>
  hashCanonicalJson('compile-input', input);

export const renderInputIdentity = (input: JsonValue): string =>
  hashCanonicalJson('render-input', input);
