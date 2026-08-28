/**
 * @file IWriteRepository.ts
 * @description Write-only repository contract, decoupled from any concrete persistence technology.
 */

/**
 * Write-only repository contract.
 *
 * Prepared for `create`, `update`, `delete`, `save` and bulk operations,
 * with no concrete implementation.
 *
 * @typeParam TEntity - Type of the entity written.
 * @typeParam TId - Type of the entity's identifier.
 */
export interface IWriteRepository<TEntity, TId = string> {
  create(entity: TEntity): Promise<void>;
  update(entity: TEntity): Promise<void>;
  delete(id: TId): Promise<void>;
  save(entity: TEntity): Promise<void>;
  createMany(entities: ReadonlyArray<TEntity>): Promise<void>;
  updateMany(entities: ReadonlyArray<TEntity>): Promise<void>;
  deleteMany(ids: ReadonlyArray<TId>): Promise<void>;
}
