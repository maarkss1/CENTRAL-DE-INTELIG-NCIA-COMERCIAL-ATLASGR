import { api } from '../../lib/api';
import type { QualificationMatrixItemInput, ObjectionMatrixItemInput } from './playbook.schema';

export interface QualificationMatrixItem {
  id: string;
  organizationId: string;
  brand: 'atlasgr' | 'totaltrac';
  segment: string;
  persona: string;
  framework: 'SPIN' | 'BANT' | 'MEDDPICC' | 'SNAP' | 'CHALLENGER';
  questionCategory: 'Situação' | 'Problema' | 'Implicação/Custo' | 'Necessidade/ROI';
  questionText: string;
  idealAnswer: string;
  createdAt: string;
  updatedAt: string;
}

export interface ObjectionMatrixItem {
  id: string;
  organizationId: string;
  brand: 'atlasgr' | 'totaltrac';
  segment: string;
  persona: string;
  objectionTitle: string;
  objectionText: string;
  responseScript: string;
  keyDifferentiator: string;
  createdAt: string;
  updatedAt: string;
}

export const playbookApi = {
  // GET .../qualification-matrix e .../objection-matrix devolvem o envelope paginado
  // { success, data, meta } (ver QualificationMatrixController/ObjectionMatrixController) — a
  // presença de `meta` faz apiFetch devolver `{ data, meta }` em vez do array puro (ver
  // "Support standardized { success, data } format" em src/lib/api.ts). Sem o `.then` abaixo,
  // QualificationMatrixPage/ObjectionsMatrixPage recebiam esse objeto como `items` e quebravam
  // em runtime no primeiro `items.map(...)` (`items.map is not a function`).
  listQualifications: (brand?: string) =>
    api
      .get<{ data: QualificationMatrixItem[]; meta: unknown }>(
        `/api/playbook/qualification-matrix${brand ? `?brand=${encodeURIComponent(brand)}` : ''}`,
      )
      .then((res) => res.data),
  createQualification: (input: QualificationMatrixItemInput) =>
    api.post<QualificationMatrixItem>('/api/playbook/qualification-matrix', input),
  updateQualification: (id: string, input: Partial<QualificationMatrixItemInput>) =>
    api.put<QualificationMatrixItem>(`/api/playbook/qualification-matrix/${id}`, input),
  deleteQualification: (id: string) => api.delete<void>(`/api/playbook/qualification-matrix/${id}`),

  listObjections: (brand?: string) =>
    api
      .get<{ data: ObjectionMatrixItem[]; meta: unknown }>(
        `/api/playbook/objection-matrix${brand ? `?brand=${encodeURIComponent(brand)}` : ''}`,
      )
      .then((res) => res.data),
  createObjection: (input: ObjectionMatrixItemInput) =>
    api.post<ObjectionMatrixItem>('/api/playbook/objection-matrix', input),
  updateObjection: (id: string, input: Partial<ObjectionMatrixItemInput>) =>
    api.put<ObjectionMatrixItem>(`/api/playbook/objection-matrix/${id}`, input),
  deleteObjection: (id: string) => api.delete<void>(`/api/playbook/objection-matrix/${id}`),
};
