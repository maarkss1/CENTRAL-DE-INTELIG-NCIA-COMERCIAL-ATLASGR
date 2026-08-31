import type { ObjectionMatrixItem, ObjectionMatrixItemRepository } from '../domain/ObjectionMatrixItem';
import { prisma } from '../../../../lib/prisma';
import type { Prisma } from '@prisma/client';

export class PrismaObjectionMatrixRepository implements ObjectionMatrixItemRepository {
  async findAllWithFilters(
    organizationId: string,
    brand?: string,
    page: number = 1,
    limit: number = 200,
  ): Promise<{ data: ObjectionMatrixItem[]; meta: unknown }> {
    const where: Prisma.ObjectionMatrixItemWhereInput = { organizationId };
    if (brand) where.brand = brand;

    const skip = (page - 1) * limit;

    const [data, total] = await prisma.$transaction([
      prisma.objectionMatrixItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
      }),
      prisma.objectionMatrixItem.count({ where }),
    ]);

    return {
      data: data as unknown as ObjectionMatrixItem[],
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(organizationId: string, id: string): Promise<ObjectionMatrixItem | null> {
    const item = await prisma.objectionMatrixItem.findFirst({ where: { id, organizationId } });
    return item as unknown as ObjectionMatrixItem | null;
  }

  async create(
    organizationId: string,
    data: Partial<ObjectionMatrixItem>,
  ): Promise<ObjectionMatrixItem> {
    const created = await prisma.objectionMatrixItem.create({
      data: { ...data, organizationId } as Prisma.ObjectionMatrixItemUncheckedCreateInput,
    });
    return created as unknown as ObjectionMatrixItem;
  }

  async update(
    organizationId: string,
    id: string,
    data: Partial<ObjectionMatrixItem>,
  ): Promise<ObjectionMatrixItem> {
    const existing = await prisma.objectionMatrixItem.findFirst({ where: { id, organizationId } });
    if (!existing) throw new Error('Objeção não encontrada');
    const updated = await prisma.objectionMatrixItem.update({
      where: { id },
      data: data as Prisma.ObjectionMatrixItemUncheckedUpdateInput,
    });
    return updated as unknown as ObjectionMatrixItem;
  }

  async delete(organizationId: string, id: string): Promise<ObjectionMatrixItem> {
    const existing = await prisma.objectionMatrixItem.findFirst({ where: { id, organizationId } });
    if (!existing) throw new Error('Objeção não encontrada');
    const deleted = await prisma.objectionMatrixItem.delete({ where: { id } });
    return deleted as unknown as ObjectionMatrixItem;
  }
}
