import { describe, it, expect, beforeEach } from 'vitest';
import { CopilotoBitrixWritebackUseCases } from '../CopilotoBitrixWritebackUseCases';
import type { BitrixLeadWritebackPort } from '../../../../shared/contracts/bitrixWriteback.contract';
import type {
  CopilotoIaRepository,
  CopilotoCrmFieldSuggestionDTO,
  CopilotoBitrixFieldMappingDTO,
  UpsertBitrixFieldMappingInput,
  CopilotoCrmEntityType,
  CopilotoSuggestionStatus,
} from '../../domain/CopilotoIa';

const ORG_ID = 'org-1';

function baseSuggestion(
  overrides: Partial<CopilotoCrmFieldSuggestionDTO> = {},
): CopilotoCrmFieldSuggestionDTO {
  return {
    id: 'sugg-1',
    conversationId: 'conv-1',
    entityType: 'LEAD',
    entityId: 'lead-1',
    fieldCode: 'principal_dor',
    previousValue: null,
    suggestedValue: 'Custo de frete acima do orçamento',
    confidence: null,
    status: 'APPROVED',
    approvedBy: 'user-1',
    approvedAt: new Date(),
    writebackAt: null,
    writebackError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Repositório fake — só o subconjunto de `CopilotoIaRepository` que a Onda 4 usa. */
class FakeRepository implements Partial<CopilotoIaRepository> {
  suggestions = new Map<string, CopilotoCrmFieldSuggestionDTO>();
  fieldMappings = new Map<string, CopilotoBitrixFieldMappingDTO>();
  leadBitrixIds = new Map<string, string>();

  async getCrmFieldSuggestionById(_organizationId: string, id: string) {
    return this.suggestions.get(id) ?? null;
  }

  async updateCrmFieldSuggestionStatus(
    _organizationId: string,
    id: string,
    data: {
      status: CopilotoSuggestionStatus;
      approvedBy?: string;
      approvedAt?: Date;
      writebackAt?: Date;
      writebackError?: string | null;
    },
  ) {
    const suggestion = this.suggestions.get(id);
    if (!suggestion) throw new Error('not found');
    const updated = { ...suggestion, ...data };
    this.suggestions.set(id, updated);
    return updated;
  }

  async upsertBitrixFieldMapping(_organizationId: string, data: UpsertBitrixFieldMappingInput) {
    const key = `${data.entityType}:${data.semanticField}`;
    const mapping: CopilotoBitrixFieldMappingDTO = {
      id: key,
      entityType: data.entityType,
      semanticField: data.semanticField,
      bitrixFieldCode: data.bitrixFieldCode,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.fieldMappings.set(key, mapping);
    return mapping;
  }

  async listBitrixFieldMappings() {
    return Array.from(this.fieldMappings.values());
  }

  async deleteBitrixFieldMapping(_organizationId: string, id: string) {
    this.fieldMappings.delete(id);
  }

  async getBitrixFieldCode(
    _organizationId: string,
    entityType: CopilotoCrmEntityType,
    semanticField: string,
  ) {
    return this.fieldMappings.get(`${entityType}:${semanticField}`)?.bitrixFieldCode ?? null;
  }

  async getLeadBitrixId(_organizationId: string, leadId: string) {
    return this.leadBitrixIds.get(leadId) ?? null;
  }
}

class FakeBitrixPort implements BitrixLeadWritebackPort {
  calls: { organizationId: string; bitrixLeadId: string; fields: Record<string, string> }[] = [];
  shouldFail = false;
  failureMessage = 'Bitrix indisponível';

  async updateLeadFields(
    organizationId: string,
    bitrixLeadId: string,
    fields: Record<string, string>,
  ): Promise<void> {
    this.calls.push({ organizationId, bitrixLeadId, fields });
    if (this.shouldFail) throw new Error(this.failureMessage);
  }
}

describe('CopilotoBitrixWritebackUseCases', () => {
  let repository: FakeRepository;
  let bitrixPort: FakeBitrixPort;
  let useCases: CopilotoBitrixWritebackUseCases;

  beforeEach(() => {
    repository = new FakeRepository();
    bitrixPort = new FakeBitrixPort();
    useCases = new CopilotoBitrixWritebackUseCases(
      repository as unknown as CopilotoIaRepository,
      bitrixPort,
    );
  });

  describe('writebackSuggestion', () => {
    it('rejeita sugestão que não está APPROVED nem FAILED', async () => {
      repository.suggestions.set('sugg-1', baseSuggestion({ status: 'PENDING' }));
      await expect(useCases.writebackSuggestion(ORG_ID, 'sugg-1')).rejects.toThrow(
        'Só é possível executar writeback',
      );
    });

    it('marca FAILED com motivo legível quando entityType não é LEAD', async () => {
      repository.suggestions.set('sugg-1', baseSuggestion({ entityType: 'COMPANY' }));
      const result = await useCases.writebackSuggestion(ORG_ID, 'sugg-1');
      expect(result.status).toBe('FAILED');
      expect(result.writebackError).toContain('COMPANY');
      expect(bitrixPort.calls).toHaveLength(0);
    });

    it('marca FAILED quando o Lead não tem bitrixLeadId (nunca sincronizado)', async () => {
      repository.suggestions.set('sugg-1', baseSuggestion());
      // leadBitrixIds vazio — lead-1 não tem bitrixLeadId
      const result = await useCases.writebackSuggestion(ORG_ID, 'sugg-1');
      expect(result.status).toBe('FAILED');
      expect(result.writebackError).toContain('sincronizado');
      expect(bitrixPort.calls).toHaveLength(0);
    });

    it('marca FAILED quando não há mapeamento configurado para o campo', async () => {
      repository.suggestions.set('sugg-1', baseSuggestion());
      repository.leadBitrixIds.set('lead-1', 'bx-123');
      // nenhum mapeamento configurado para principal_dor/LEAD
      const result = await useCases.writebackSuggestion(ORG_ID, 'sugg-1');
      expect(result.status).toBe('FAILED');
      expect(result.writebackError).toContain('Nenhum mapeamento configurado');
      expect(bitrixPort.calls).toHaveLength(0);
    });

    it('escreve no Bitrix e marca WRITTEN_BACK quando tudo está configurado', async () => {
      repository.suggestions.set('sugg-1', baseSuggestion());
      repository.leadBitrixIds.set('lead-1', 'bx-123');
      await repository.upsertBitrixFieldMapping(ORG_ID, {
        entityType: 'LEAD',
        semanticField: 'principal_dor',
        bitrixFieldCode: 'UF_CRM_1700000000001',
      });

      const result = await useCases.writebackSuggestion(ORG_ID, 'sugg-1');

      expect(result.status).toBe('WRITTEN_BACK');
      expect(result.writebackAt).not.toBeNull();
      expect(result.writebackError).toBeNull();
      expect(bitrixPort.calls).toEqual([
        {
          organizationId: ORG_ID,
          bitrixLeadId: 'bx-123',
          fields: { UF_CRM_1700000000001: 'Custo de frete acima do orçamento' },
        },
      ]);
    });

    it('marca FAILED com a mensagem real quando o Bitrix rejeita a escrita', async () => {
      repository.suggestions.set('sugg-1', baseSuggestion());
      repository.leadBitrixIds.set('lead-1', 'bx-123');
      await repository.upsertBitrixFieldMapping(ORG_ID, {
        entityType: 'LEAD',
        semanticField: 'principal_dor',
        bitrixFieldCode: 'UF_CRM_1700000000001',
      });
      bitrixPort.shouldFail = true;
      bitrixPort.failureMessage = 'Bitrix24 retornou erro de permissão no campo.';

      const result = await useCases.writebackSuggestion(ORG_ID, 'sugg-1');
      expect(result.status).toBe('FAILED');
      expect(result.writebackError).toBe('Bitrix24 retornou erro de permissão no campo.');
    });

    it('permite reenviar uma sugestão FAILED depois que o mapeamento é configurado', async () => {
      repository.suggestions.set(
        'sugg-1',
        baseSuggestion({ status: 'FAILED', writebackError: 'Nenhum mapeamento configurado...' }),
      );
      repository.leadBitrixIds.set('lead-1', 'bx-123');
      await repository.upsertBitrixFieldMapping(ORG_ID, {
        entityType: 'LEAD',
        semanticField: 'principal_dor',
        bitrixFieldCode: 'UF_CRM_1700000000001',
      });

      const result = await useCases.writebackSuggestion(ORG_ID, 'sugg-1');
      expect(result.status).toBe('WRITTEN_BACK');
    });
  });

  describe('upsertFieldMapping', () => {
    it('rejeita semanticField/bitrixFieldCode vazios', async () => {
      await expect(
        useCases.upsertFieldMapping(ORG_ID, {
          entityType: 'LEAD',
          semanticField: '',
          bitrixFieldCode: 'UF_CRM_123',
        }),
      ).rejects.toThrow('semanticField');

      await expect(
        useCases.upsertFieldMapping(ORG_ID, {
          entityType: 'LEAD',
          semanticField: 'principal_dor',
          bitrixFieldCode: '  ',
        }),
      ).rejects.toThrow('bitrixFieldCode');
    });

    it('cria o mapeamento com sucesso', async () => {
      const mapping = await useCases.upsertFieldMapping(ORG_ID, {
        entityType: 'LEAD',
        semanticField: 'concorrente',
        bitrixFieldCode: 'UF_CRM_1700000000002',
      });
      expect(mapping.bitrixFieldCode).toBe('UF_CRM_1700000000002');
      expect(await useCases.listFieldMappings(ORG_ID)).toHaveLength(1);
    });
  });
});
