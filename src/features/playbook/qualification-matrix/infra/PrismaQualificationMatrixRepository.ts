import {
  QualificationMatrixItem,
  QualificationMatrixItemRepository,
} from '../domain/QualificationMatrixItem';
import { prisma } from '../../../../lib/prisma';
import { Prisma } from '@prisma/client';

export class PrismaQualificationMatrixRepository implements QualificationMatrixItemRepository {
  async findAllWithFilters(
    organizationId: string,
    brand?: string,
    page: number = 1,
    limit: number = 200,
  ): Promise<{ data: QualificationMatrixItem[]; meta: unknown }> {
    const where: Prisma.QualificationMatrixItemWhereInput = { organizationId };
    if (brand) where.brand = brand;

    const skip = (page - 1) * limit;

    const [data, total] = await prisma.$transaction([
      prisma.qualificationMatrixItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
      }),
      prisma.qualificationMatrixItem.count({ where }),
    ]);

    return {
      data: data as unknown as QualificationMatrixItem[],
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(organizationId: string, id: string): Promise<QualificationMatrixItem | null> {
    const item = await prisma.qualificationMatrixItem.findFirst({ where: { id, organizationId } });
    return item as unknown as QualificationMatrixItem | null;
  }

  async create(
    organizationId: string,
    data: Partial<QualificationMatrixItem>,
  ): Promise<QualificationMatrixItem> {
    const created = await prisma.qualificationMatrixItem.create({
      data: { ...data, organizationId } as Prisma.QualificationMatrixItemUncheckedCreateInput,
    });
    return created as unknown as QualificationMatrixItem;
  }

  async update(
    organizationId: string,
    id: string,
    data: Partial<QualificationMatrixItem>,
  ): Promise<QualificationMatrixItem> {
    const existing = await prisma.qualificationMatrixItem.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new Error('Item de qualificação não encontrado');
    const updated = await prisma.qualificationMatrixItem.update({
      where: { id },
      data: data as Prisma.QualificationMatrixItemUncheckedUpdateInput,
    });
    return updated as unknown as QualificationMatrixItem;
  }

  async delete(organizationId: string, id: string): Promise<QualificationMatrixItem> {
    const existing = await prisma.qualificationMatrixItem.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new Error('Item de qualificação não encontrado');
    const deleted = await prisma.qualificationMatrixItem.delete({ where: { id } });
    return deleted as unknown as QualificationMatrixItem;
  }
}
