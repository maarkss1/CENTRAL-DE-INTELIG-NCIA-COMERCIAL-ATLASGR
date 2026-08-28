/**
 * @file Pagination.ts
 * @description Reusable pagination request value object.
 */

export type PaginationSortDirection = 'asc' | 'desc';

export interface PaginationSort {
  readonly field: string;
  readonly direction: PaginationSortDirection;
}

/**
 * Reusable pagination request.
 * Preparado para: page, pageSize, offset, limit, sort, direction, filters.
 */
export class Pagination {
  public readonly page: number;
  public readonly pageSize: number;
  public readonly sort: ReadonlyArray<PaginationSort>;
  public readonly filters: Readonly<Record<string, unknown>>;

  public constructor(input: {
    readonly page?: number;
    readonly pageSize?: number;
    readonly sort?: ReadonlyArray<PaginationSort>;
    readonly filters?: Readonly<Record<string, unknown>>;
  }) {
    this.page = Math.max(1, input.page ?? 1);
    this.pageSize = Math.min(200, Math.max(1, input.pageSize ?? 20));
    this.sort = input.sort ?? [];
    this.filters = input.filters ?? {};
  }

  public get offset(): number {
    return (this.page - 1) * this.pageSize;
  }

  public get limit(): number {
    return this.pageSize;
  }
}
