/**
 * Regras de negócio do writeback no Bitrix24 (Onda 4). Separado de `CopilotoIaUseCases` de
 * propósito: é o único ponto do módulo que depende de uma porta externa
 * (`BitrixLeadWritebackPort`, ver `src/shared/contracts/bitrixWriteback.contract.ts`) — mantém o
 * resto do módulo testável sem precisar de um fake de Bitrix.
 *
 * Regra central: NUNCA assume um código `UF_CRM_*` fixo. Sem mapeamento configurado
 * (`CopilotoBitrixFieldMapping`) para o par (entityType, fieldCode) desta organização, a tentativa
 * falha explicitamente (`FAILED` + `writebackError` legível) — nunca grava no campo errado.
 */
import { AppError } from '../../../shared/middlewares/errorHandler';
import type { BitrixLeadWritebackPort } from '../../../shared/contracts/bitrixWriteback.contract';
import type {
  CopilotoIaRepository,
  CopilotoBitrixFieldMappingDTO,
  UpsertBitrixFieldMappingInput,
  CopilotoCrmFieldSuggestionDTO,
} from '../domain/CopilotoIa';

export class CopilotoBitrixWritebackUseCases {
  constructor(
    private repository: CopilotoIaRepository,
    private bitrixPort: BitrixLeadWritebackPort,
  ) {}

  async upsertFieldMapping(
    organizationId: string,
    input: UpsertBitrixFieldMappingInput,
  ): Promise<CopilotoBitrixFieldMappingDTO> {
    if (!input.semanticField.trim()) throw new AppError('Campo "semanticField" vazio.', 400);
    if (!input.bitrixFieldCode.trim()) throw new AppError('Campo "bitrixFieldCode" vazio.', 400);
    return this.repository.upsertBitrixFieldMapping(organizationId, {
      entityType: input.entityType,
      semanticField: input.semanticField.trim(),
      bitrixFieldCode: input.bitrixFieldCode.trim(),
    });
  }

  async listFieldMappings(organizationId: string): Promise<CopilotoBitrixFieldMappingDTO[]> {
    return this.repository.listBitrixFieldMappings(organizationId);
  }

  async deleteFieldMapping(organizationId: string, id: string): Promise<void> {
    await this.repository.deleteBitrixFieldMapping(organizationId, id);
  }

  /**
   * Executa o writeback de uma sugestão já `APPROVED` (ou tenta de novo uma que ficou `FAILED` —
   * ex.: depois que o mapeamento foi configurado). Nunca lança por causa de um erro do LADO do
   * Bitrix/mapeamento — sempre resolve com a sugestão marcada `WRITTEN_BACK` ou `FAILED` (com o
   * motivo em `writebackError`), para o chamador HTTP sempre ter uma resposta 200 com o resultado
   * real, em vez de um 500 genérico escondendo qual writeback específico falhou e por quê.
   */
  async writebackSuggestion(
    organizationId: string,
    suggestionId: string,
  ): Promise<CopilotoCrmFieldSuggestionDTO> {
    const suggestion = await this.repository.getCrmFieldSuggestionById(
      organizationId,
      suggestionId,
    );
    if (!suggestion) throw new AppError('Sugestão de campo de CRM não encontrada.', 404);
    if (suggestion.status !== 'APPROVED' && suggestion.status !== 'FAILED') {
      throw new AppError(
        `Só é possível executar writeback de uma sugestão APPROVED (ou reenviar uma FAILED) — status atual: ${suggestion.status}.`,
        409,
      );
    }

    if (suggestion.entityType !== 'LEAD') {
      return this.repository.updateCrmFieldSuggestionStatus(organizationId, suggestionId, {
        status: 'FAILED',
        writebackError: `Writeback ainda não implementado para ${suggestion.entityType} — só LEAD nesta onda (Onda 4).`,
      });
    }

    const bitrixLeadId = await this.repository.getLeadBitrixId(organizationId, suggestion.entityId);
    if (!bitrixLeadId) {
      return this.repository.updateCrmFieldSuggestionStatus(organizationId, suggestionId, {
        status: 'FAILED',
        writebackError:
          'O Lead ainda não está sincronizado com o Bitrix24 (sem bitrixLeadId) — sincronize o Lead antes de tentar o writeback.',
      });
    }

    const bitrixFieldCode = await this.repository.getBitrixFieldCode(
      organizationId,
      suggestion.entityType,
      suggestion.fieldCode,
    );
    if (!bitrixFieldCode) {
      return this.repository.updateCrmFieldSuggestionStatus(organizationId, suggestionId, {
        status: 'FAILED',
        writebackError: `Nenhum mapeamento configurado para o campo "${suggestion.fieldCode}" (LEAD) — configure em Configurações > Integrações antes de tentar de novo.`,
      });
    }

    try {
      await this.bitrixPort.updateLeadFields(organizationId, bitrixLeadId, {
        [bitrixFieldCode]: suggestion.suggestedValue,
      });
      return this.repository.updateCrmFieldSuggestionStatus(organizationId, suggestionId, {
        status: 'WRITTEN_BACK',
        writebackAt: new Date(),
        writebackError: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.repository.updateCrmFieldSuggestionStatus(organizationId, suggestionId, {
        status: 'FAILED',
        writebackError: message,
      });
    }
  }
}
