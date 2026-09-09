import { z } from 'zod';

/** Null explicitly means unlimited. Integers remain readable for historical authorizations. */
export const productionLimitsSchema = z
  .object({
    maxCalls: z.number().int().min(1).nullable(),
    maxSearches: z.number().int().min(1).nullable(),
    maxImages: z.number().int().min(0).nullable(),
    maxTakes: z.number().int().min(1).nullable(),
    maxImageCorrections: z.number().int().min(0).nullable(),
    maxEditorialCorrections: z.number().int().min(0).nullable(),
    maxFilmCorrections: z.number().int().min(0).nullable(),
    maxTechnicalRepairs: z.number().int().min(0).nullable(),
  })
  .strict();

export const studioAuthorizationSchema = z
  .object({
    schemaVersion: z.literal(1),
    decisionId: z.string().uuid(),
    runId: z.string().min(1),
    requestSha256: z.string().regex(/^[a-f0-9]{64}$/),
    previousDecisionId: z.string().uuid().nullable(),
    limits: productionLimitsSchema,
    issuedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
    signature: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export type ProductionLimits = z.infer<typeof productionLimitsSchema>;
export const PRODUCTION_LIMIT_DEFAULTS: ProductionLimits = {
  maxCalls: null,
  maxSearches: null,
  maxImages: null,
  maxTakes: null,
  maxImageCorrections: null,
  maxEditorialCorrections: null,
  maxFilmCorrections: null,
  maxTechnicalRepairs: null,
};
export type StudioAuthorization = z.infer<typeof studioAuthorizationSchema>;
