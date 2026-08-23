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
    listQualifications: (brand?: string) =>
        api.get<QualificationMatrixItem[]>(`/api/playbook/qualification-matrix${brand ? `?brand=${encodeURIComponent(brand)}` : ''}`),
    createQualification: (input: QualificationMatrixItemInput) =>
        api.post<QualificationMatrixItem>('/api/playbook/qualification-matrix', input),
    updateQualification: (id: string, input: Partial<QualificationMatrixItemInput>) =>
        api.put<QualificationMatrixItem>(`/api/playbook/qualification-matrix/${id}`, input),
    deleteQualification: (id: string) =>
        api.delete<void>(`/api/playbook/qualification-matrix/${id}`),

    listObjections: (brand?: string) =>
        api.get<ObjectionMatrixItem[]>(`/api/playbook/objection-matrix${brand ? `?brand=${encodeURIComponent(brand)}` : ''}`),
    createObjection: (input: ObjectionMatrixItemInput) =>
        api.post<ObjectionMatrixItem>('/api/playbook/objection-matrix', input),
    updateObjection: (id: string, input: Partial<ObjectionMatrixItemInput>) =>
        api.put<ObjectionMatrixItem>(`/api/playbook/objection-matrix/${id}`, input),
    deleteObjection: (id: string) =>
        api.delete<void>(`/api/playbook/objection-matrix/${id}`),
};
