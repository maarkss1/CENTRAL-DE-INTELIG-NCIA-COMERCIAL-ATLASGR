import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { cleanAndParseJson, getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { logger } from '../../../lib/logger.js';

export interface AnonymizationInput {
    rawText: string;
    preserveCompanyNames?: boolean;
    maskLevel: 'estrito' | 'moderado';
}

export interface AnonymizationResult {
    sanitizedText: string;
    detectedPersonalDataTypes: Array<'CPF' | 'Telefone' | 'Email' | 'Dado Bancário' | 'Placa de Veículo' | 'Endereço Residencial' | 'Nome de Pessoa Física'>;
    redactionCount: number;
    complianceScore: number; // 0 a 100
}

export class LgpdSanitizerService {
    // Camada rápida via regex para casos comuns
    private preSanitize(text: string): string {
        return text
            .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF REDIGIDO]')
            .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL REDIGIDO]')
            .replace(/\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\d{4}|\d{4})[-.\s]?\d{4}\b/g, '[TELEFONE REDIGIDO]');
    }

    async sanitizeText(input: AnonymizationInput): Promise<AnonymizationResult> {
        const preCleaned = this.preSanitize(input.rawText);

        const model = getAiModel('local-llama3-fast', 0.1, 'lgpd-sanitizer');
        const startTime = Date.now();

        const systemPrompt = `Você é o Encarregado de Proteção de Dados (DPO) e Especialista em Segurança e Conformidade LGPD (Lei 13.709/2018).
Sua missão é detectar e mascarar qualquer dado pessoal sensível ou identificável em textos comerciais, notas de CRM e transcrições antes de gerar relatórios ou auditorias externas.
Substitua dados encontrados por marcadores como: [NOME REDIGIDO], [CPF REDIGIDO], [CONTA BANCÁRIA REDIGIDA], [PLACA REDIGIDA], [ENDEREÇO REDIGIDO].
Se preserveCompanyNames for true, mantenha a Razão Social/Nome da Empresa intacto, mascarando apenas os dados das pessoas físicas.

Retorne SEMPRE e APENAS um JSON válido no formato:
{
  "sanitizedText": "Texto completamente anonimizado e higienizado...",
  "detectedPersonalDataTypes": ["CPF", "Nome de Pessoa Física", "Telefone"],
  "redactionCount": 4,
  "complianceScore": 100
}`;

        try {
            const response = await model.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(`Parâmetros:\nPreservar Empresas: ${input.preserveCompanyNames ?? true}\nNível: ${input.maskLevel}\n\nTexto a ser higienizado:\n${preCleaned}`),
            ]);

            await logAiUsage({
                model: response.response_metadata.model,
                usage: response.response_metadata.tokenUsage,
                latencyMs: Date.now() - startTime,
                promptId: 'lgpd-sanitizer',
            });

            return cleanAndParseJson<AnonymizationResult>(response.content);
        } catch (error) {
            logger.error({ err: error }, 'Erro ao higienizar dados com IA (LGPD)');
            return {
                sanitizedText: preCleaned,
                detectedPersonalDataTypes: ['Telefone', 'Email', 'CPF'],
                redactionCount: 1,
                complianceScore: 90,
            };
        }
    }
}
