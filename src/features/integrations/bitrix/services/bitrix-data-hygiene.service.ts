import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { cleanAndParseJson, getAiModel, logAiUsage } from '../../../../lib/ai/gateway.js';
import { logger } from '../../../../lib/logger.js';

export interface RawLeadData {
    companyName: string;
    contactName?: string;
    jobTitle?: string;
    rawNotes?: string;
    segmentHint?: string;
}

export interface SanitizedLeadData {
    cleanCompanyName: string;
    commercialName: string; // Nome fantasia amigável para mensagens (ex: "TransLog" ao invés de "TRANSLOG TRANSPORTES RODOVIARIOS LTDA ME")
    standardizedJobTitle: string;
    seniorityLevel: 'C-Level / Diretoria' | 'Gerência' | 'Coordenação / Supervisão' | 'Operacional / Analista';
    inferredSegment: string;
    dataCompletenessScore: number; // 0 a 100
    missingFields: string[];
    suggestedTags: string[];
}

export class BitrixDataHygieneService {
    async sanitizeLeadData(lead: RawLeadData): Promise<SanitizedLeadData> {
        const model = getAiModel('local-llama3-fast', 0.1, 'bitrix-hygiene');
        const startTime = Date.now();

        const systemPrompt = `Você é um engenheiro de qualidade e higienização de dados de CRM B2B.
Sua missão é padronizar e limpar dados brutos importados do Bitrix24 para o ecossistema AtlasGR / TotalTrac.
Regras de padronização:
1. "commercialName": Nome informal e limpo da empresa para uso em e-mails/WhatsApp (remova LTDA, S/A, ME, EPP, TRANSPORTES, etc. e use Capital Case correto).
2. "standardizedJobTitle": Padronize cargos confusos (ex: "ger. logist" -> "Gerente de Logística").
3. "seniorityLevel": Classifique a senioridade do contato.
4. "inferredSegment": Deduza o nicho de mercado (ex: "Transporte Rodoviário de Cargas", "Distribuição Urbana", "Agro / Grãos", "Química / Perigosos").
5. "dataCompletenessScore": Nota de 0 a 100 baseada na prontidão do lead para abordagem comercial.

Retorne SEMPRE e APENAS um JSON válido no formato:
{
  "cleanCompanyName": "Razão Social Formatada",
  "commercialName": "Nome Fantasia Curto",
  "standardizedJobTitle": "Cargo Padronizado",
  "seniorityLevel": "Gerência",
  "inferredSegment": "Transporte de Cargas",
  "dataCompletenessScore": 85,
  "missingFields": ["telefone_direto"],
  "suggestedTags": ["Frota Pesada", "Decisor"]
}`;

        try {
            const response = await model.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(`Dados Brutos do Lead:\n${JSON.stringify(lead, null, 2)}`),
            ]);

            await logAiUsage({
                model: response.response_metadata.model,
                usage: response.response_metadata.tokenUsage,
                latencyMs: Date.now() - startTime,
                promptId: 'bitrix-lead-hygiene',
            });

            return cleanAndParseJson<SanitizedLeadData>(response.content);
        } catch (error) {
            logger.error({ err: error }, 'Erro ao higienizar dados do Bitrix');
            return {
                cleanCompanyName: lead.companyName.trim(),
                commercialName: lead.companyName.replace(/\b(LTDA|ME|EPP|S\/A|SA)\b/gi, '').trim(),
                standardizedJobTitle: lead.jobTitle || 'Contato Comercial',
                seniorityLevel: 'Operacional / Analista',
                inferredSegment: lead.segmentHint || 'Logística e Transporte',
                dataCompletenessScore: 50,
                missingFields: [],
                suggestedTags: ['Importado Bitrix'],
            };
        }
    }
}
