import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { cleanAndParseJson, getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { logger } from '../../../lib/logger.js';

export interface AnonymizationInput {
  rawText: string;
  preserveCompanyNames?: boolean;
  maskLevel: 'estrito' | 'moderado';
}

const PERSONAL_DATA_TYPES = [
  'CPF',
  'Telefone',
  'Email',
  'Dado Bancário',
  'Placa de Veículo',
  'Endereço Residencial',
  'Nome de Pessoa Física',
] as const;

export interface AnonymizationResult {
  sanitizedText: string;
  detectedPersonalDataTypes: Array<(typeof PERSONAL_DATA_TYPES)[number]>;
  redactionCount: number;
  complianceScore: number; // 0 a 100
  // true quando o resultado NÃO pôde ser verificado como totalmente anonimizado
  // (IA indisponível/saída inválida, ou PII residual detectada após o processamento)
  // e portanto exige revisão humana antes de ser usado em relatório/auditoria externa.
  requiresManualReview: boolean;
}

const RESIDUAL_PII_PATTERNS: Array<{ type: (typeof PERSONAL_DATA_TYPES)[number]; regex: RegExp }> =
  [
    { type: 'CPF', regex: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g },
    { type: 'Email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
    {
      type: 'Telefone',
      regex: /\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\d{4}|\d{4})[-.\s]?\d{4}\b/g,
    },
  ];

export class LgpdSanitizerService {
  // Camada rápida via regex para casos comuns
  private preSanitize(text: string): string {
    return text
      .replace(RESIDUAL_PII_PATTERNS[0].regex, '[CPF REDIGIDO]')
      .replace(RESIDUAL_PII_PATTERNS[1].regex, '[EMAIL REDIGIDO]')
      .replace(RESIDUAL_PII_PATTERNS[2].regex, '[TELEFONE REDIGIDO]');
  }

  /** Detecta CPF/e-mail/telefone que sobreviveram ao processamento da IA. */
  private findResidualPii(text: string): Array<(typeof PERSONAL_DATA_TYPES)[number]> {
    return RESIDUAL_PII_PATTERNS.filter(({ regex }) => {
      regex.lastIndex = 0;
      return regex.test(text);
    }).map(({ type }) => type);
  }

  private isValidResult(
    candidate: unknown,
  ): candidate is Omit<AnonymizationResult, 'requiresManualReview'> {
    if (!candidate || typeof candidate !== 'object') return false;
    const c = candidate as Record<string, unknown>;
    return (
      typeof c.sanitizedText === 'string' &&
      c.sanitizedText.length > 0 &&
      Array.isArray(c.detectedPersonalDataTypes) &&
      c.detectedPersonalDataTypes.every((t) =>
        (PERSONAL_DATA_TYPES as readonly string[]).includes(t as string),
      ) &&
      typeof c.redactionCount === 'number' &&
      typeof c.complianceScore === 'number' &&
      c.complianceScore >= 0 &&
      c.complianceScore <= 100
    );
  }

  /** Resultado degradado e HONESTO usado sempre que a anonimização não pôde ser verificada. */
  private degradedResult(
    preCleaned: string,
    reason: string,
    alertContext: Record<string, unknown>,
  ): AnonymizationResult {
    logger.error(
      { ...alertContext },
      `Higienização LGPD não verificada (${reason}) — devolvendo resultado marcado para revisão manual, sem inflar o score de conformidade`,
    );
    return {
      sanitizedText: preCleaned,
      detectedPersonalDataTypes: this.findResidualPii(preCleaned).length
        ? this.findResidualPii(preCleaned)
        : ['Telefone', 'Email', 'CPF'],
      redactionCount: 0,
      complianceScore: 0,
      requiresManualReview: true,
    };
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
        new HumanMessage(
          `Parâmetros:\nPreservar Empresas: ${input.preserveCompanyNames ?? true}\nNível: ${input.maskLevel}\n\nTexto a ser higienizado:\n${preCleaned}`,
        ),
      ]);

      await logAiUsage({
        model: response.response_metadata.model,
        usage: response.response_metadata.tokenUsage,
        latencyMs: Date.now() - startTime,
        promptId: 'lgpd-sanitizer',
      });

      const parsed = cleanAndParseJson<unknown>(response.content);

      if (!this.isValidResult(parsed)) {
        return this.degradedResult(preCleaned, 'saída da IA fora do formato esperado', {
          rawOutput: parsed,
        });
      }

      const residualPii = this.findResidualPii(parsed.sanitizedText);
      if (residualPii.length > 0) {
        // A IA devolveu um formato válido, mas deixou PII regex-detectável no texto —
        // prova concreta de que a anonimização falhou. Nunca reportar isso como sucesso.
        return this.degradedResult(
          this.preSanitize(parsed.sanitizedText),
          `PII residual detectada após anonimização: ${residualPii.join(', ')}`,
          { residualPii },
        );
      }

      return { ...parsed, requiresManualReview: false };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao higienizar dados com IA (LGPD)');
      return this.degradedResult(preCleaned, 'falha ao invocar o modelo de IA', {
        err: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
