import { Repository } from '../../../../shared/domain/Repository';

export type ObjectionBrand = 'atlasgr' | 'totaltrac';

export interface ObjectionMatrixItem {
    id: string;
    organizationId: string;
    brand: ObjectionBrand;
    segment: string;
    persona: string;
    objectionTitle: string;
    objectionText: string;
    responseScript: string;
    keyDifferentiator: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface ObjectionMatrixItemRepository extends Repository<ObjectionMatrixItem> {
    findAllWithFilters(organizationId: string, brand?: string, page?: number, limit?: number): Promise<{ data: ObjectionMatrixItem[]; meta: unknown }>;
}
