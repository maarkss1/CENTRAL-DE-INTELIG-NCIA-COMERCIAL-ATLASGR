import type {
  ObjectionMatrixItem,
  ObjectionMatrixItemRepository,
} from '../domain/ObjectionMatrixItem';
import { objectionMatrixItemSchema, type ObjectionMatrixItemInput } from '../../playbook.schema';
import { BaseUseCases } from '../../../../shared/application/BaseUseCases';

export class ObjectionMatrixUseCases extends BaseUseCases<
  ObjectionMatrixItem,
  ObjectionMatrixItemRepository
> {
  constructor(repository: ObjectionMatrixItemRepository) {
    super(repository);
  }

  // Página fixa (1, 200) era um bug latente: organizações com mais de 200 objeções cadastradas
  // numa marca perdiam os itens excedentes silenciosamente, mesmo o repositório já suportando
  // paginação real (`findAllWithFilters`) — achado do Piloto 017, corrigido propagando page/limit
  // até aqui em vez de fixá-los.
  // limit=200 preserva o default usado pelos chamadores legados que não passam `limit` (ex.:
  // usePlaybookMatrixData.ts, consumido pelo Chatbook) — só ObjectionsMatrixPage passa um
  // `limit` menor (paginação real de UI).
  async findItems(organizationId: string, brand?: string, page: number = 1, limit: number = 200) {
    return this.findAll(organizationId, brand, page, limit);
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
