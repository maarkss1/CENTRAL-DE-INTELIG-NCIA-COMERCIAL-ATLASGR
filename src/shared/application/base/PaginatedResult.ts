/**
 * @file PaginatedResult.ts
 * @description Reusable paginated result value object.
 */

/**
 * Reusable paginated result.
 * Preparado para: items, total, page, pageSize, pages, hasNext, hasPrevious.
 *
 * @typeParam TItem - Type of the items contained in the page.
 */
export class PaginatedResult<TItem> {
  public readonly items: ReadonlyArray<TItem>;
  public readonly total: number;
  public readonly page: number;
  public readonly pageSize: number;

  public constructor(items: ReadonlyArray<TItem>, total: number, page: number, pageSize: number) {
    this.items = items;
    this.total = total;
    this.page = page;
    this.pageSize = pageSize;
  }

  public get pages(): number {
    return this.pageSize === 0 ? 0 : Math.ceil(this.total / this.pageSize);
  }

  public get hasNext(): boolean {
    return this.page < this.pages;
  }

  public get hasPrevious(): boolean {
    return this.page > 1;
  }

  public map<TMapped>(mapper: (item: TItem) => TMapped): PaginatedResult<TMapped> {
    return new PaginatedResult<TMapped>(
      this.items.map(mapper),
      this.total,
      this.page,
      this.pageSize,
    );
  }
}
