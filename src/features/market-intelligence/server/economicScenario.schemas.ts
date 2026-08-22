import { z } from 'zod';

const money = z.number().finite().min(0).max(1_000_000_000);
const percentage = z.number().finite().min(0).max(100);
const nullableFinite = z.number().finite().nullable();
const period = z.string().regex(/^\d{4}-\d{2}$/).nullable();

const costsSchema = z.object({
    salary: money,
    payrollCharges: money,
    benefits: money,
    vehicle: money,
    fuel: money,
    lodging: money,
    tolls: money,
    fixedCommission: money,
    tools: money,
    administration: money,
}).strict();

const revenueSchema = z.object({
    averageMrrTicket: money,
    grossMarginPct: percentage,
    winRatePct: percentage,
    meetingToQualifiedOpportunityPct: percentage,
    monthlyChurnPct: percentage,
    salesCycleDays: z.number().finite().min(0).max(3650),
    fullProductivityQualifiedOpportunitiesPerMonth: z.number().finite().min(0).max(100_000),
    variableCommissionPctOfNewMrr: percentage,
    penetrationPct: percentage,
}).strict();

const policySchema = z.object({
    maxPaybackMonths: z.number().int().min(1).max(120).nullable(),
    minRoi12Pct: z.number().finite().min(-100_000).max(100_000).nullable(),
    minRoi24Pct: z.number().finite().min(-100_000).max(100_000).nullable(),
}).strict();

const calibrationSnapshotSchema = z.object({
    quality: z.enum(['INSUFICIENTE', 'BAIXA', 'MEDIA', 'ALTA']),
    eligible: z.boolean(),
    totalClosedSample: z.number().int().min(0).max(10_000_000),
    monthsWithClosedSample: z.number().int().min(0).max(120),
    fromPeriod: period,
    toPeriod: period,
    recommended: z.object({
        averageMrrTicket: nullableFinite,
        winRatePct: nullableFinite,
        salesCycleDays: nullableFinite,
    }).strict(),
    blockers: z.array(z.string().trim().min(1).max(500)).max(20),
}).strict();

export const economicScenarioSaveSchema = z.object({
    label: z.string().trim().min(1).max(120).optional(),
    territoryId: z.string().trim().min(1).max(200),
    serviceableSharePct: percentage,
    costs: costsSchema,
    revenue: revenueSchema,
    upfrontInvestment: money,
    policy: policySchema,
    scenario: z.enum(['CONSERVADOR', 'BASE', 'AGRESSIVO']),
    calibration: z.object({
        applied: z.boolean(),
        snapshot: calibrationSnapshotSchema.nullable(),
    }).strict(),
}).strict().superRefine((value, ctx) => {
    if (value.calibration.applied && !value.calibration.snapshot?.eligible) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['calibration', 'applied'],
            message: 'Calibração marcada como aplicada precisa ter snapshot elegível.',
        });
    }
});

export const economicScenarioListQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

export const economicScenarioParamsSchema = z.object({
    id: z.string().uuid(),
}).strict();

export type EconomicScenarioSavePayload = z.infer<typeof economicScenarioSaveSchema>;
export type EconomicScenarioListQuery = z.infer<typeof economicScenarioListQuerySchema>;
