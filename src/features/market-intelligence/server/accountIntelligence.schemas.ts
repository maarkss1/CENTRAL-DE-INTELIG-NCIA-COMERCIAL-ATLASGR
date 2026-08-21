import { z } from 'zod';

const optionalTrimmedString = z.preprocess(
    (value) => (value === '' || value === undefined ? undefined : value),
    z.string().trim().min(1).max(100).optional(),
);

export const accountParamsSchema = z.object({
    id: z.string().trim().min(1).max(128),
});

export const recommendationParamsSchema = z.object({
    id: z.string().trim().min(1).max(128),
    recommendationId: z.string().trim().min(1).max(128),
});

export const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const signalQuerySchema = paginationSchema.extend({
    status: z.enum(['Active', 'Dismissed', 'Expired']).optional(),
    // O banco proíbe sinal classificado como recomendação: sinal é observação ou inferência.
    evidenceType: z.enum(['FACT', 'INFERENCE']).optional(),
    type: optionalTrimmedString,
});

export const decisionMakerQuerySchema = paginationSchema.extend({
    status: z.enum(['Active', 'Inactive', 'Unverified']).optional(),
    buyingRole: optionalTrimmedString,
});

export const relationshipQuerySchema = paginationSchema.extend({
    status: z.enum(['Verified', 'Inferred', 'Rejected', 'Inactive']).optional(),
    relationType: optionalTrimmedString,
});

export const recommendationQuerySchema = paginationSchema.extend({
    status: z.enum(['Pending', 'Approved', 'Executed', 'Dismissed', 'Superseded', 'Failed']).optional(),
});

export const evidenceQuerySchema = paginationSchema.extend({
    evidenceType: z.enum(['FACT', 'INFERENCE', 'RECOMMENDATION']).optional(),
    subjectType: optionalTrimmedString,
});

export type SignalQuery = z.infer<typeof signalQuerySchema>;
export type DecisionMakerQuery = z.infer<typeof decisionMakerQuerySchema>;
export type RelationshipQuery = z.infer<typeof relationshipQuerySchema>;
export type RecommendationQuery = z.infer<typeof recommendationQuerySchema>;
export type EvidenceQuery = z.infer<typeof evidenceQuerySchema>;
