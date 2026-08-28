import {
  QualificationMatrixItem,
  QualificationMatrixItemRepository,
} from '../domain/QualificationMatrixItem';
import {
  qualificationMatrixItemSchema,
  type QualificationMatrixItemInput,
} from '../../playbook.schema';
import { BaseUseCases } from '../../../../shared/application/BaseUseCases';

export class QualificationMatrixUseCases extends BaseUseCases<
  QualificationMatrixItem,
  QualificationMatrixItemRepository
> {
  constructor(repository: QualificationMatrixItemRepository) {
    super(repository);
  }

  async findItems(organizationId: string, brand?: string) {
    return this.findAll(organizationId, brand, 1, 200);
  }

  async createItem(organizationId: string, data: QualificationMatrixItemInput) {
    const validated = qualificationMatrixItemSchema.parse(data);
    return this.create(organizationId, validated);
  }

  async updateItem(
    organizationId: string,
    id: string,
    data: Partial<QualificationMatrixItemInput>,
  ) {
    const validated = qualificationMatrixItemSchema.partial().parse(data);
    return this.update(organizationId, id, validated);
  }

  async deleteItem(organizationId: string, id: string) {
    return this.delete(organizationId, id);
  }
}
