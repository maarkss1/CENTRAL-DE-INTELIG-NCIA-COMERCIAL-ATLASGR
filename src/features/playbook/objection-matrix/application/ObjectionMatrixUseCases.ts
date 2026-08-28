import { ObjectionMatrixItem, ObjectionMatrixItemRepository } from '../domain/ObjectionMatrixItem';
import { objectionMatrixItemSchema, type ObjectionMatrixItemInput } from '../../playbook.schema';
import { BaseUseCases } from '../../../../shared/application/BaseUseCases';

export class ObjectionMatrixUseCases extends BaseUseCases<
  ObjectionMatrixItem,
  ObjectionMatrixItemRepository
> {
  constructor(repository: ObjectionMatrixItemRepository) {
    super(repository);
  }

  async findItems(organizationId: string, brand?: string) {
    return this.findAll(organizationId, brand, 1, 200);
  }

  async createItem(organizationId: string, data: ObjectionMatrixItemInput) {
    const validated = objectionMatrixItemSchema.parse(data);
    return this.create(organizationId, validated);
  }

  async updateItem(organizationId: string, id: string, data: Partial<ObjectionMatrixItemInput>) {
    const validated = objectionMatrixItemSchema.partial().parse(data);
    return this.update(organizationId, id, validated);
  }

  async deleteItem(organizationId: string, id: string) {
    return this.delete(organizationId, id);
  }
}
