/**
 * useDatabase.ts — React hooks for real-time data from the PostgreSQL/Prisma backend.
 * Provides loading state, error handling, refetch, and CRUD mutations for all modules.
 */

import { useState, useEffect, useCallback } from 'react';
import { companiesDB, contactsDB, leadsDB, activitiesDB, analyticsDB } from '../lib/db';
import type { Company, Contact, Lead, Activity, PaginatedResponse } from '../types';

// ─── Generic fetch hook ────────────────────────────────────────────────────────
function useFetch<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, refetch: load };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPANIES HOOK
// ─────────────────────────────────────────────────────────────────────────────
export function useCompanies(params?: { page?: number; limit?: number; search?: string; status?: string; segment?: string }) {
  const { data, loading, error, refetch } = useFetch(
    () => companiesDB.list(params),
    [params?.page, params?.limit, params?.search, params?.status, params?.segment]
  );

  const createCompany = useCallback(async (newData: Partial<Company>) => {
    const created = await companiesDB.create(newData);
    await refetch();
    return created;
  }, [refetch]);

  const updateCompany = useCallback(async (id: string, updates: Partial<Company>) => {
    const updated = await companiesDB.update(id, updates);
    await refetch();
    return updated;
  }, [refetch]);

  const deleteCompany = useCallback(async (id: string) => {
    await companiesDB.delete(id);
    await refetch();
  }, [refetch]);

  return {
    companies: (data as PaginatedResponse<Company>)?.data ?? [],
    meta: (data as PaginatedResponse<Company>)?.meta,
    loading,
    error,
    refetch,
    createCompany,
    updateCompany,
    deleteCompany,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACTS HOOK
// ─────────────────────────────────────────────────────────────────────────────
export function useContacts(params?: { page?: number; limit?: number; search?: string; companyId?: string; status?: string }) {
  const { data, loading, error, refetch } = useFetch(
    () => contactsDB.list(params),
    [params?.page, params?.limit, params?.search, params?.companyId, params?.status]
  );

  const createContact = useCallback(async (newData: Partial<Contact>) => {
    const created = await contactsDB.create(newData);
    await refetch();
    return created;
  }, [refetch]);

  const updateContact = useCallback(async (id: string, updates: Partial<Contact>) => {
    const updated = await contactsDB.update(id, updates);
    await refetch();
    return updated;
  }, [refetch]);

  const deleteContact = useCallback(async (id: string) => {
    await contactsDB.delete(id);
    await refetch();
  }, [refetch]);

  return {
    contacts: (data as PaginatedResponse<Contact>)?.data ?? [],
    meta: (data as PaginatedResponse<Contact>)?.meta,
    loading,
    error,
    refetch,
    createContact,
    updateContact,
    deleteContact,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LEADS / CRM HOOK
// ─────────────────────────────────────────────────────────────────────────────
export function useLeads(params?: { page?: number; limit?: number; status?: string; companyId?: string; owner?: string }) {
  const { data, loading, error, refetch } = useFetch(
    () => leadsDB.list(params),
    [params?.page, params?.limit, params?.status, params?.companyId, params?.owner]
  );

  const createLead = useCallback(async (newData: Partial<Lead>) => {
    const created = await leadsDB.create(newData);
    await refetch();
    return created;
  }, [refetch]);

  const updateLead = useCallback(async (id: string, updates: Partial<Lead>) => {
    const updated = await leadsDB.update(id, updates);
    await refetch();
    return updated;
  }, [refetch]);

  const moveLead = useCallback(async (id: string, status: string) => {
    const updated = await leadsDB.updateStatus(id, status);
    await refetch();
    return updated;
  }, [refetch]);

  const deleteLead = useCallback(async (id: string) => {
    await leadsDB.delete(id);
    await refetch();
  }, [refetch]);

  return {
    leads: (data as PaginatedResponse<Lead>)?.data ?? [],
    meta: (data as PaginatedResponse<Lead>)?.meta,
    loading,
    error,
    refetch,
    createLead,
    updateLead,
    moveLead,
    deleteLead,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITIES HOOK
// ─────────────────────────────────────────────────────────────────────────────
export function useActivities(params?: { page?: number; limit?: number; leadId?: string; status?: string; type?: string; from?: string; to?: string }) {
  // `from`/`to` faltavam neste array de deps: o efeito em useFetch só reagia a page/limit/leadId/
  // status/type, então trocar o intervalo de datas (ex.: navegar de mês no calendário) nunca
  // disparava um novo fetch — a tela ficava presa nos dados do primeiro intervalo carregado.
  // `from`/`to` já chegam como string (YYYY-MM-DD), não `Date`, então comparam por valor de forma
  // estável entre renders — adicioná-los aqui não reintroduz o problema de um `new Date()` que
  // mudaria de identidade a cada render.
  const { data, loading, error, refetch } = useFetch(
    () => activitiesDB.list(params),
    [params?.page, params?.limit, params?.leadId, params?.status, params?.type, params?.from, params?.to]
  );

  const createActivity = useCallback(async (newData: Partial<Activity>) => {
    const created = await activitiesDB.create(newData);
    await refetch();
    return created;
  }, [refetch]);

  const updateActivity = useCallback(async (id: string, updates: Partial<Activity>) => {
    const updated = await activitiesDB.update(id, updates);
    await refetch();
    return updated;
  }, [refetch]);

  const deleteActivity = useCallback(async (id: string) => {
    await activitiesDB.delete(id);
    await refetch();
  }, [refetch]);

  return {
    activities: (data as PaginatedResponse<Activity>)?.data ?? [],
    meta: (data as PaginatedResponse<Activity>)?.meta,
    loading,
    error,
    refetch,
    createActivity,
    updateActivity,
    deleteActivity,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS OVERVIEW HOOK
// ─────────────────────────────────────────────────────────────────────────────
export function useAnalytics() {
  return useFetch(() => analyticsDB.overview(), []);
}
