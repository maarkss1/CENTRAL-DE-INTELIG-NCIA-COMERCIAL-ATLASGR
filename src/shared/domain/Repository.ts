export interface Repository<T> {
    findById?(organizationId: string, id: string): Promise<T | null>;
    findAll?(organizationId: string, query?: string, page?: number, limit?: number): Promise<{ data: T[], meta: unknown }>;
    create?(organizationId: string, data: unknown): Promise<T>;
    update?(organizationId: string, id: string, data: unknown): Promise<T>;
    delete?(organizationId: string, id: string): Promise<unknown>;
}
