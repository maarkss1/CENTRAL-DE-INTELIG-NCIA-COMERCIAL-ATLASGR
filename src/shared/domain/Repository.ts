export interface PaginationMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface Repository<T> {
    findById?(organizationId: string, id: string): Promise<T | null>;
    findAll?(organizationId: string, query?: string, page?: number, limit?: number): Promise<{ data: T[], meta: PaginationMeta }>;
    create?(organizationId: string, data: Partial<T> | Record<string, unknown>): Promise<T>;
    update?(organizationId: string, id: string, data: Partial<T> | Record<string, unknown>): Promise<T>;
    delete?(organizationId: string, id: string): Promise<T | void>;
}
