/**
 * @file IReadRepository.ts
 * @description Read-only repository contract, decoupled from any concrete persistence technology.
 */

/**
 * Sort direction applied to a query.
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Generic sort option for a repository query.
 *
 * @typeParam TEntity - Type of the entity being queried.
 */
export interface SortOption<TEntity> {
  readonly field: keyof TEntity;
  readonly direction: SortDirection;
}

/**
 * Generic filter option for a repository query. Kept intentionally loose
 * to remain independent from any concrete query language.
 *
 * @typeParam TEntity - Type of the entity being queried.
 */
export type FilterOptions<TEntity> = Partial<Record<keyof TEntity, unknown>>;

/**
 * Options accepted by {@link IReadRepository.findAll}.
 *
 * @typeParam TEntity - Type of the entity being queried.
 */
export interface FindAllOptions<TEntity> {
  readonly filters?: FilterOptions<TEntity>;
  readonly sort?: ReadonlyArray<SortOption<TEntity>>;
}

/**
 * Options accepted by {@link IReadRepository.findPaginated}.
 *
 * @typeParam TEntity - Type of the entity being queried.
 */
export interface PaginatedQueryOptions<TEntity> extends FindAllOptions<TEntity> {
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Result produced by {@link IReadRepository.findPaginated}.
 *
 * @typeParam TEntity - Type of the entity being queried.
 */
export interface PaginatedQueryResult<TEntity> {
  readonly items: ReadonlyArray<TEntity>;
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pages: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
}

/**
 * Read-only repository contract.
 *
 * Prepared for `findById`, `findAll`, `exists`, `count` and pagination,
 * with no dependency on Prisma or any concrete database.
 *
 * @typeParam TEntity - Type of the entity read.
 * @typeParam TId - Type of the entity's identifier.
 */
export interface IReadRepository<TEntity, TId = string> {
  findById(id: TId): Promise<TEntity | null>;
  findAll(options?: FindAllOptions<TEntity>): Promise<ReadonlyArray<TEntity>>;
  findPaginated(options: PaginatedQueryOptions<TEntity>): Promise<PaginatedQueryResult<TEntity>>;
  exists(id: TId): Promise<boolean>;
  count(options?: FindAllOptions<TEntity>): Promise<number>;
}
