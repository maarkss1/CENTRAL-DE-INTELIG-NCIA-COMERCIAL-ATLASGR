import { z } from 'zod';

export const LeadSchema = z.object({
  name: z.string().min(2, 'O nome deve ter no mínimo 2 caracteres'),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  segment: z.string().optional(),
  size: z.string().optional(),
  location: z.string().optional(),
  source: z.string().optional(),
  description: z.string().optional(),
  fitScore: z.number().min(0).max(100).optional(),
});

export const CompanySchema = z.object({
  name: z.string().min(2),
  document: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
});

export const ContactSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  companyId: z.string().cuid().optional(),
});

export const DealSchema = z.object({
  title: z.string().min(2),
  amount: z.number().min(0).optional(),
  currency: z.string().default('BRL'),
  pipelineId: z.string().cuid().optional(),
  stageId: z.string().cuid().optional(),
  companyId: z.string().cuid().optional(),
  contactId: z.string().cuid().optional(),
});

export const NoteSchema = z
  .object({
    content: z.string().min(1, 'A nota não pode estar vazia'),
    leadId: z.string().cuid().optional(),
    companyId: z.string().cuid().optional(),
    contactId: z.string().cuid().optional(),
    dealId: z.string().cuid().optional(),
  })
  .refine((data) => data.leadId || data.companyId || data.contactId || data.dealId, {
    message:
      'A nota deve estar associada a pelo menos uma entidade (Lead, Company, Contact ou Deal)',
  });

export const ActivitySchema = z.object({
  type: z.enum(['call', 'email', 'meeting', 'task', 'note']),
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['pending', 'completed', 'cancelled']).default('pending'),
  dueDate: z.string().datetime().optional(),
  leadId: z.string().cuid().optional(),
  companyId: z.string().cuid().optional(),
  contactId: z.string().cuid().optional(),
  dealId: z.string().cuid().optional(),
});

export const ICPProfileSchema = z.object({
  name: z.string().min(2),
  segments: z.array(z.string()),
  cnaes: z.array(z.string()),
  minRevenue: z.number().optional(),
  maxRevenue: z.number().optional(),
  minEmployees: z.number().optional(),
  maxEmployees: z.number().optional(),
  regions: z.array(z.string()),
  technologies: z.array(z.string()),
  decisionMakerProfile: z.string().optional(),
  digitalMaturity: z.string().optional(),
  logisticPotential: z.string().optional(),
  strategicPriority: z.string().optional(),
  baseScore: z.number().default(0),
});

export const PersonaSchema = z.object({
  name: z.string().min(2),
  role: z.string().optional(),
  painPoints: z.array(z.string()),
  goals: z.array(z.string()),
  objections: z.array(z.string()),
  triggers: z.array(z.string()),
  arguments: z.array(z.string()),
  channels: z.array(z.string()),
  companyId: z.string().cuid().optional(),
});

export const ObjectionSchema = z.object({
  category: z.string().min(2),
  objection: z.string().min(5),
  answer: z.string().min(5),
  argument: z.string().optional(),
  socialProof: z.string().optional(),
  cta: z.string().optional(),
});

export const TemplateSchema = z.object({
  name: z.string().min(2),
  type: z.enum(['email', 'linkedin', 'whatsapp', 'framework']),
  content: z.string().min(1),
});
