/**
 * db.ts — Frontend Database Service Layer
 * Connects the React frontend to the real Prisma/PostgreSQL backend via the Express REST API.
 * All methods use the existing api.ts helper (Bearer token + JSON Content-Type).
 */

import { api } from './api';
import type { Company, Contact, Lead, Activity, PaginatedResponse } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// COMPANIES
// ─────────────────────────────────────────────────────────────────────────────
export const companiesDB = {
  /** List companies with optional filters */
  list: (params?: { page?: number; limit?: number; search?: string; status?: string; segment?: string; city?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.search) qs.set('search', params.search);
    if (params?.status) qs.set('status', params.status);
    if (params?.segment) qs.set('segment', params.segment);
    if (params?.city) qs.set('city', params.city);
    return api.get<PaginatedResponse<Company>>(`/api/companies?${qs.toString()}`);
  },

  /** Get a single company by ID */
  get: (id: string) => api.get<Company>(`/api/companies/${id}`),

  /** Create a new company */
  create: (data: Partial<Company>) => api.post<Company>('/api/companies', data),

  /** Update an existing company */
  update: (id: string, data: Partial<Company>) => api.put<Company>(`/api/companies/${id}`, data),

  /** Delete a company */
  delete: (id: string) => api.delete<void>(`/api/companies/${id}`),

  /** Enrich company data via CNPJ (Receita Federal integration) */
  enrich: (cnpj: string) => api.post<Partial<Company>>('/api/companies/enrich', { cnpj }),
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTACTS
// ─────────────────────────────────────────────────────────────────────────────
export const contactsDB = {
  /** List contacts with optional filters */
  list: (params?: { page?: number; limit?: number; search?: string; companyId?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.search) qs.set('search', params.search);
    if (params?.companyId) qs.set('companyId', params.companyId);
    if (params?.status) qs.set('status', params.status);
    return api.get<PaginatedResponse<Contact>>(`/api/contacts?${qs.toString()}`);
  },

  /** Get a single contact by ID */
  get: (id: string) => api.get<Contact>(`/api/contacts/${id}`),

  /** Create a new contact */
  create: (data: Partial<Contact>) => api.post<Contact>('/api/contacts', data),

  /** Update a contact */
  update: (id: string, data: Partial<Contact>) => api.put<Contact>(`/api/contacts/${id}`, data),

  /** Delete a contact */
  delete: (id: string) => api.delete<void>(`/api/contacts/${id}`),

  /** Validate email via SMTP live check */
  validateEmail: (email: string) => api.post<{ valid: boolean; reason?: string }>('/api/contacts/validate-email', { email }),
};

// ─────────────────────────────────────────────────────────────────────────────
// LEADS / CRM PIPELINE
// ─────────────────────────────────────────────────────────────────────────────
export const leadsDB = {
  /** List leads (CRM Kanban board) */
  list: (params?: { page?: number; limit?: number; status?: string; companyId?: string; owner?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.status) qs.set('status', params.status);
    if (params?.companyId) qs.set('companyId', params.companyId);
    if (params?.owner) qs.set('owner', params.owner);
    return api.get<PaginatedResponse<Lead>>(`/api/leads?${qs.toString()}`);
  },

  /** Get full lead detail with timeline and notes */
  get: (id: string) => api.get<Lead>(`/api/leads/${id}`),

  /** Create a new lead/deal */
  create: (data: Partial<Lead>) => api.post<Lead>('/api/leads', data),

  /** Update lead status, score, qualification */
  update: (id: string, data: Partial<Lead>) => api.put<Lead>(`/api/leads/${id}`, data),

  /** Move lead to a different pipeline stage */
  updateStatus: (id: string, status: string) => api.put<Lead>(`/api/leads/${id}`, { status }),

  /** Delete a lead */
  delete: (id: string) => api.delete<void>(`/api/leads/${id}`),

  /** Add a note to a lead */
  addNote: (leadId: string, content: string, author: string) =>
    api.post<{ id: string; content: string }>(`/api/leads/${leadId}/notes`, { content, author }),
};

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITIES / AGENDA
// ─────────────────────────────────────────────────────────────────────────────
export const activitiesDB = {
  /** List activities with optional date range and filters */
  list: (params?: { page?: number; limit?: number; leadId?: string; status?: string; type?: string; from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.leadId) qs.set('leadId', params.leadId);
    if (params?.status) qs.set('status', params.status);
    if (params?.type) qs.set('type', params.type);
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    return api.get<PaginatedResponse<Activity>>(`/api/activities?${qs.toString()}`);
  },

  /** Get a single activity */
  get: (id: string) => api.get<Activity>(`/api/activities/${id}`),

  /** Create a new activity / schedule */
  create: (data: Partial<Activity>) => api.post<Activity>('/api/activities', data),

  /** Update activity (mark done, reschedule) */
  update: (id: string, data: Partial<Activity>) => api.put<Activity>(`/api/activities/${id}`, data),

  /** Delete an activity */
  delete: (id: string) => api.delete<void>(`/api/activities/${id}`),
};

// ─────────────────────────────────────────────────────────────────────────────
// PROSPECTING (AI Search Engine)
// ─────────────────────────────────────────────────────────────────────────────
export const prospectingDB = {
  /** Run a prospecting search with AI criteria */
  search: (criteria: {
    segmento?: string;
    localizacao?: string;
    tamanhoFrota?: string;
    faturamento?: string;
    dorPrincipal?: string;
    tecnologiaAtual?: string;
  }) => api.post<{ companies: Company[]; insights: string }>('/api/prospecting', criteria),

  /** Enrich a company directly from CNPJ */
  enrichByCnpj: (cnpj: string) => api.get<Partial<Company>>(`/api/companies/enrich?cnpj=${cnpj}`),
};

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS & DASHBOARD STATS
// ─────────────────────────────────────────────────────────────────────────────
export const analyticsDB = {
  /** Platform overview stats for the dashboard */
  overview: () => api.get<{
    totalCompanies: number;
    totalContacts: number;
    totalLeads: number;
    totalActivities: number;
    pendingActivities: number;
    overdueActivities: number;
    closedThisMonth: number;
    lostThisMonth: number;
    /** `null` porque o modelo Lead não tem campo de valor monetário — a UI exibe "—". */
    pipelineValue: number | null;
    conversionRate: number;
    averageScore: number | null;
  }>('/api/analytics/overview'),
};

// ─────────────────────────────────────────────────────────────────────────────
// AI TOOL BUILDER STORE (uses localStorage as persistence for custom AI tools)
// ─────────────────────────────────────────────────────────────────────────────
export const aiToolsStore = {
  STORAGE_KEY: 'atlas_custom_ai_tools',

  list: (): { id: string; name: string; category: string; prompt: string; createdAt: string }[] => {
    try {
      return JSON.parse(localStorage.getItem(aiToolsStore.STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  },

  save: (tool: { name: string; category: string; prompt: string }) => {
    const tools = aiToolsStore.list();
    const newTool = { ...tool, id: Date.now().toString(), createdAt: new Date().toISOString() };
    tools.unshift(newTool);
    localStorage.setItem(aiToolsStore.STORAGE_KEY, JSON.stringify(tools));
    return newTool;
  },

  delete: (id: string) => {
    const filtered = aiToolsStore.list().filter((t) => t.id !== id);
    localStorage.setItem(aiToolsStore.STORAGE_KEY, JSON.stringify(filtered));
  },
};
