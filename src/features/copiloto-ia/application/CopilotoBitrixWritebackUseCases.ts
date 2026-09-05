/**
 * Regras de negócio do writeback no Bitrix24 (Onda 4, estendido para COMPANY/CONTACT na Onda 7).
 * Separado de `CopilotoIaUseCases` de propósito: é o único ponto do módulo que depende de uma
 * porta externa (`BitrixLeadWritebackPort`, ver `src/shared/contracts/bitrixWriteback.contract.ts`)
 * — mantém o resto do módulo testável sem precisar de um fake de Bitrix.
 *
 * Regra central: NUNCA assume um código `UF_CRM_*` fixo. Sem mapeamento configurado
 * (`CopilotoBitrixFieldMapping`) para o par (entityType, fieldCode) desta organização, a tentativa
 * falha explicitamente (`FAILED` + `writebackError` legível) — nunca grava no campo errado.
 *
 * COMPANY/CONTACT só têm `bitrixCompanyId`/`bitrixContactId` preenchido quando o registro nasceu
 * da importação de um Negócio do Bitrix24 (`crm.deal.get` → `COMPANY_ID`/`CONTACT_ID`, ver
 * `src/features/integrations/bitrix/service/deals.ts`) — uma Company/Contact criada por qualquer
 * outro caminho (prospecção, import manual, enriquecimento) nunca teve esse vínculo capturado e o
 * writeback falha explicitamente (mesmo padrão de "Lead sem bitrixLeadId" abaixo), nunca tenta
 * adivinhar ou criar um registro novo do lado do Bitrix.
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

    const resolution = await this.resolveBitrixEntityId(organizationId, suggestion);
    if (!resolution.ok) {
      return this.repository.updateCrmFieldSuggestionStatus(organizationId, suggestionId, {
        status: 'FAILED',
        writebackError: resolution.error,
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
        writebackError: `Nenhum mapeamento configurado para o campo "${suggestion.fieldCode}" (${suggestion.entityType}) — configure em Configurações > Integrações antes de tentar de novo.`,
      });
    }

    try {
      await resolution.updateFields({ [bitrixFieldCode]: suggestion.suggestedValue });
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

  /**
   * Resolve o id Bitrix da entidade da sugestão e devolve uma função já fechada sobre esse id
   * pronta para escrever os campos — mantém `writebackSuggestion` acima igual para os três tipos
   * de entidade, sem repetir a checagem de "sincronizado com o Bitrix?" três vezes.
   */
  private async resolveBitrixEntityId(
    organizationId: string,
    suggestion: CopilotoCrmFieldSuggestionDTO,
  ): Promise<
    | { ok: true; updateFields: (fields: Record<string, string>) => Promise<void> }
    | { ok: false; error: string }
  > {
    switch (suggestion.entityType) {
      case 'LEAD': {
        const bitrixLeadId = await this.repository.getLeadBitrixId(
          organizationId,
          suggestion.entityId,
        );
        if (!bitrixLeadId) {
          return {
            ok: false,
            error:
              'O Lead ainda não está sincronizado com o Bitrix24 (sem bitrixLeadId) — sincronize o Lead antes de tentar o writeback.',
          };
        }
        return {
          ok: true,
          updateFields: (fields) =>
            this.bitrixPort.updateLeadFields(organizationId, bitrixLeadId, fields),
        };
      }
      case 'COMPANY': {
        const bitrixCompanyId = await this.repository.getCompanyBitrixId(
          organizationId,
          suggestion.entityId,
        );
        if (!bitrixCompanyId) {
          return {
            ok: false,
            error:
              'A Company ainda não está sincronizada com o Bitrix24 (sem bitrixCompanyId — hoje só é capturado quando a Company nasce da importação de um Negócio do Bitrix) — não é possível fazer o writeback.',
          };
        }
        return {
          ok: true,
          updateFields: (fields) =>
            this.bitrixPort.updateCompanyFields(organizationId, bitrixCompanyId, fields),
        };
      }
      case 'CONTACT': {
        const bitrixContactId = await this.repository.getContactBitrixId(
          organizationId,
          suggestion.entityId,
        );
        if (!bitrixContactId) {
          return {
            ok: false,
            error:
              'O Contact ainda não está sincronizado com o Bitrix24 (sem bitrixContactId — hoje só é capturado quando o Contact nasce da importação de um Negócio do Bitrix) — não é possível fazer o writeback.',
          };
        }
        return {
          ok: true,
          updateFields: (fields) =>
            this.bitrixPort.updateContactFields(organizationId, bitrixContactId, fields),
        };
      }
    }
  }
}
