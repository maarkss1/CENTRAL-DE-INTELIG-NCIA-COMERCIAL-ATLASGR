import { z } from 'zod';

const optionalText = z.string().trim().max(5000).optional().nullable();
const percentage = z.number().finite().min(0).max(100);

export const crmProductSchema = z.object({
    name: z.string().trim().min(1).max(180),
    description: optionalText,
    sku: z.string().trim().max(80).optional().nullable(),
    type: z.enum(['Produto', 'Servico']).default('Servico'),
    category: z.string().trim().max(120).optional().nullable(),
    unit: z.string().trim().min(1).max(20).default('un'),
    price: z.number().finite().min(0),
    cost: z.number().finite().min(0).optional().nullable(),
    currency: z.string().trim().length(3).default('BRL'),
    taxPercent: percentage.default(0),
    active: z.boolean().default(true),
    stockQuantity: z.number().finite().min(0).optional().nullable(),
    customFields: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const crmDealItemSchema = z.object({
    productId: z.string().optional().nullable(),
    name: z.string().trim().min(1).max(180),
    sku: z.string().trim().max(80).optional().nullable(),
    quantity: z.number().finite().positive().default(1),
    unitPrice: z.number().finite().min(0),
    discountPercent: percentage.default(0),
    taxPercent: percentage.default(0),
    sortOrder: z.number().int().min(0).default(0),
});

export const commercialLineItemSchema = z.object({
    productId: z.string().optional().nullable(),
    name: z.string().trim().min(1).max(180),
    sku: z.string().trim().max(80).optional().nullable(),
    quantity: z.number().finite().positive(),
    unitPrice: z.number().finite().min(0),
    discountPercent: percentage.default(0),
    taxPercent: percentage.default(0),
    total: z.number().finite().min(0).optional(),
});

export const crmDocumentSchema = z.object({
    number: z.string().trim().min(1).max(80).optional(),
    type: z.enum(['Orcamento', 'Proposta', 'Fatura', 'Contrato']),
    status: z.enum(['Rascunho', 'Enviado', 'Visualizado', 'Aceito', 'Recusado', 'Vencido', 'Pago', 'Cancelado']).default('Rascunho'),
    title: z.string().trim().min(1).max(180),
    currency: z.string().trim().length(3).default('BRL'),
    issueDate: z.string().datetime().optional(),
    validUntil: z.string().datetime().optional().nullable(),
    dueDate: z.string().datetime().optional().nullable(),
    discount: z.number().finite().min(0).default(0),
    lineItems: z.array(commercialLineItemSchema).min(1),
    notes: optionalText,
    terms: optionalText,
    leadId: z.string().optional().nullable(),
    companyId: z.string().optional().nullable(),
    contactId: z.string().optional().nullable(),
});

export const crmPipelineStageSchema = z.object({
    name: z.string().trim().min(1).max(120),
    code: z.string().trim().regex(/^[a-z0-9_-]+$/i).max(80),
    color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#64748b'),
    sortOrder: z.number().int().min(0).default(0),
    probability: percentage.default(0),
    leadStatus: z.string().optional().nullable(),
    isWon: z.boolean().default(false),
    isLost: z.boolean().default(false),
    tunnelTargetStageId: z.string().optional().nullable(),
    automation: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const crmPipelineSchema = z.object({
    name: z.string().trim().min(1).max(120),
    entity: z.enum(['Lead', 'Negocio', 'SmartProcess']),
    isDefault: z.boolean().default(false),
    active: z.boolean().default(true),
    sortOrder: z.number().int().min(0).default(0),
    currency: z.string().trim().length(3).default('BRL'),
    stages: z.array(crmPipelineStageSchema).min(1).max(30),
});

export const moveCrmRecordSchema = z.object({
    stageId: z.string().min(1),
});

export const crmDealSchema = z.object({
    title: z.string().trim().min(1).max(180),
    companyId: z.string().optional().nullable(),
    contactId: z.string().optional().nullable(),
    owner: z.string().trim().max(120).optional().nullable(),
    source: z.string().trim().max(120).optional().nullable(),
    amount: z.number().finite().min(0).default(0),
    currency: z.string().trim().length(3).default('BRL'),
    probability: percentage.optional().nullable(),
    expectedCloseAt: z.string().datetime().optional().nullable(),
    pipelineId: z.string().optional(),
    pipelineStageId: z.string().optional(),
    customFields: z.record(z.string(), z.unknown()).optional().nullable(),
});

export type CrmDealItemInput = z.infer<typeof crmDealItemSchema>;
export type CrmDocumentInput = z.infer<typeof crmDocumentSchema>;
