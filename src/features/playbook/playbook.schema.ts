import { z } from 'zod';

export const qualificationMatrixItemSchema = z.object({
    brand: z.enum(['atlasgr', 'totaltrac']),
    segment: z.string().trim().min(1).max(120),
    persona: z.string().trim().min(1).max(120),
    framework: z.enum(['SPIN', 'BANT', 'MEDDPICC', 'SNAP', 'CHALLENGER']),
    questionCategory: z.enum(['Situação', 'Problema', 'Implicação/Custo', 'Necessidade/ROI']),
    questionText: z.string().trim().min(1).max(2000),
    idealAnswer: z.string().trim().min(1).max(2000),
});

export type QualificationMatrixItemInput = z.infer<typeof qualificationMatrixItemSchema>;

export const objectionMatrixItemSchema = z.object({
    brand: z.enum(['atlasgr', 'totaltrac']),
    segment: z.string().trim().min(1).max(120),
    persona: z.string().trim().min(1).max(120),
    objectionTitle: z.string().trim().min(1).max(180),
    objectionText: z.string().trim().min(1).max(2000),
    responseScript: z.string().trim().min(1).max(2000),
    keyDifferentiator: z.string().trim().min(1).max(2000),
});

export type ObjectionMatrixItemInput = z.infer<typeof objectionMatrixItemSchema>;
