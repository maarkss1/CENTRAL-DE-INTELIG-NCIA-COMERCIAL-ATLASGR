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

export interface PlaybookListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PlaybookListParams {
  brand?: string;
  page?: number;
  limit?: number;
}

function buildListQuery(params?: PlaybookListParams): string {
  const qs = new URLSearchParams();
  if (params?.brand) qs.set('brand', params.brand);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return query ? `?${query}` : '';
}

// GET .../qualification-matrix e .../objection-matrix devolvem o envelope paginado
// { success, data, meta } (ver QualificationMatrixController/ObjectionMatrixController) — a
// presença de `meta` faz apiFetch devolver `{ data, meta }` em vez do array puro (ver
// "Support standardized { success, data } format" em src/lib/api.ts).
function listQualificationsPage(params?: PlaybookListParams) {
  return api.get<{ data: QualificationMatrixItem[]; meta: PlaybookListMeta }>(
    `/api/playbook/qualification-matrix${buildListQuery(params)}`,
  );
}

function listObjectionsPage(params?: PlaybookListParams) {
  return api.get<{ data: ObjectionMatrixItem[]; meta: PlaybookListMeta }>(
    `/api/playbook/objection-matrix${buildListQuery(params)}`,
  );
}

export const playbookApi = {
  // Envelope paginado completo ({data, meta}) — usado pela UI real de paginação em
  // QualificationMatrixPage/ObjectionsMatrixPage. Antes desta correção os use cases da camada
  // application/ chamavam `findAll(..., 1, 200)` com página fixa — o repositório Prisma já
  // paginava de verdade, mas o parâmetro nunca chegava até a tela, e o frontend descartava
  // `meta` com `.then(res => res.data)` — então organizações com mais de 200 perguntas/objeções
  // cadastradas numa marca perdiam os itens excedentes em silêncio (achado do Piloto 017).
  listQualificationsPage,
  // Mantido com o contrato antigo (devolve só o array, sem `meta`) para não quebrar
  // src/hooks/usePlaybookMatrixData.ts (consumido pelo Chatbook, que precisa do conjunto
  // completo pra contexto de IA, não de uma tela paginada de navegação).
  listQualifications: (brand?: string) => listQualificationsPage({ brand }).then((res) => res.data),
  createQualification: (input: QualificationMatrixItemInput) =>
    api.post<QualificationMatrixItem>('/api/playbook/qualification-matrix', input),
  updateQualification: (id: string, input: Partial<QualificationMatrixItemInput>) =>
    api.put<QualificationMatrixItem>(`/api/playbook/qualification-matrix/${id}`, input),
  deleteQualification: (id: string) => api.delete<void>(`/api/playbook/qualification-matrix/${id}`),

  listObjectionsPage,
  // Mesmo motivo do listQualifications acima: mantém o contrato antigo pro Chatbook.
  listObjections: (brand?: string) => listObjectionsPage({ brand }).then((res) => res.data),
  createObjection: (input: ObjectionMatrixItemInput) =>
    api.post<ObjectionMatrixItem>('/api/playbook/objection-matrix', input),
  updateObjection: (id: string, input: Partial<ObjectionMatrixItemInput>) =>
    api.put<ObjectionMatrixItem>(`/api/playbook/objection-matrix/${id}`, input),
  deleteObjection: (id: string) => api.delete<void>(`/api/playbook/objection-matrix/${id}`),
};
