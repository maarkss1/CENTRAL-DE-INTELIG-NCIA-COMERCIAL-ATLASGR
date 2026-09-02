import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { cleanAndParseJson, getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { logger } from '../../../lib/logger.js';

export interface IncidentAlertInput {
  alertId: string;
  vehiclePlate?: string;
  clientName: string;
  alertType: string; // ex: 'Desvio de Rota Crítico', 'Violação de Trava de Baú', 'Perda de Sinal / Jammer Suspeito', 'Botão de Pânico'
  telemetryDataSummary: string;
  driverName?: string;
  cargoValueEstimated?: number;
  riskZoneClassification?: string;
}

type SeverityLevel =
  | 'P0 - Emergência Máxima / Sinistro Iminente'
  | 'P1 - Alto Risco'
  | 'P2 - Médio Risco'
  | 'P3 - Informativo / Operacional';

export interface IncidentTriageOutput {
  severityLevel: SeverityLevel;
  immediateStandardOperatingProcedure: string[];
  shouldTriggerAutomaticLockdown: boolean;
  contactAuthorityRecommendation: boolean;
  operatorChecklist: string[];
  incidentBriefing: string;
}

// Da mais baixa para a mais alta — usada para comparar/escalar severidade.
const SEVERITY_ORDER: SeverityLevel[] = [
  'P3 - Informativo / Operacional',
  'P2 - Médio Risco',
  'P1 - Alto Risco',
  'P0 - Emergência Máxima / Sinistro Iminente',
];

function normalizeSeverity(level: unknown): SeverityLevel | null {
  return typeof level === 'string' && (SEVERITY_ORDER as string[]).includes(level)
    ? (level as SeverityLevel)
    : null;
}

function severityIndex(level: SeverityLevel): number {
  return SEVERITY_ORDER.indexOf(level);
}

/**
 * Piso de severidade determinístico, espelhando as "Regras Críticas" do próprio prompt
 * (violação de trava de baú, Jammer/Anti-Jammer, botão de pânico). Existe para que uma
 * falha de instruction-following do LLM (ou o fallback de indisponibilidade) nunca
 * classifique um sinistro real como baixa prioridade. Retorna null quando nenhum
 * gatilho crítico conhecido é detectado — nesse caso a severidade fica a critério da IA
 * (ou do default conservador do fallback), sem forçar nada.
 */
function computeSeverityFloor(alert: IncidentAlertInput): SeverityLevel | null {
  const haystack = `${alert.alertType} ${alert.telemetryDataSummary}`.toLowerCase();
  const isPanic = haystack.includes('pânico') || haystack.includes('panico');
  const isJammer = haystack.includes('jammer');
  const isTravaViolation = haystack.includes('trava');
  const isHighRiskZone = (alert.riskZoneClassification ?? '').toLowerCase().includes('alto');

  if (isPanic || isJammer) {
    return 'P0 - Emergência Máxima / Sinistro Iminente';
  }
  if (isTravaViolation && isHighRiskZone) {
    return 'P0 - Emergência Máxima / Sinistro Iminente';
  }
  if (isTravaViolation) {
    return 'P1 - Alto Risco';
  }
  return null;
}

function applySeverityFloor(
  output: IncidentTriageOutput,
  alert: IncidentAlertInput,
): IncidentTriageOutput {
  const floor = computeSeverityFloor(alert);
  if (!floor || severityIndex(output.severityLevel) >= severityIndex(floor)) {
    return output;
  }
  logger.warn(
    { alertId: alert.alertId, aiSeverity: output.severityLevel, floor },
    'Severidade da triagem de sinistro elevada por regra determinística de segurança (piso não respeitado pela IA)',
  );
  return {
    ...output,
    severityLevel: floor,
    shouldTriggerAutomaticLockdown:
      floor === 'P0 - Emergência Máxima / Sinistro Iminente'
        ? true
        : output.shouldTriggerAutomaticLockdown,
    contactAuthorityRecommendation:
      floor === 'P0 - Emergência Máxima / Sinistro Iminente'
        ? true
        : output.contactAuthorityRecommendation,
  };
}

export class MesaTriageService {
  async triageIncident(alert: IncidentAlertInput): Promise<IncidentTriageOutput> {
    const model = getAiModel('local-llama3-fast', 0.1, 'mesa-triage');
    const startTime = Date.now();

    const systemPrompt = `Você é o Coordenador Sênior da Central de Monitoramento e Mesa de Tratamento de Ocorrências e Sinistros da AtlasGR / TotalTrac.
Analise os dados de telemetria e o tipo de alerta para classificar a severidade (P0 a P3) e instruir o operador com o Procedimento Operacional Padrão (POP) exato.
Regras Críticas:
- Violação de trava de baú em zona de alto risco ou detecção de Jammer/Anti-Jammer é P0 ou P1.
- Alertas falsos comuns (ex: perda de sinal em subsolo conhecido) são P3.
- Instrua passos claros e não hesite em recomendar acionamento de pronta resposta caso necessário.

Retorne SEMPRE e APENAS um JSON válido no formato:
{
  "severityLevel": "P0 - Emergência Máxima / Sinistro Iminente",
  "immediateStandardOperatingProcedure": [
    "1. Ligar imediatamente para o motorista via canal secundário",
    "2. Verificar última posição GPS e acionar espelhamento de sinal",
    "3. Enviar viatura de Pronta Resposta para a coordenada"
  ],
  "shouldTriggerAutomaticLockdown": true,
  "contactAuthorityRecommendation": true,
  "operatorChecklist": [
    "Confirmar se carga é de alto valor regulada por PGR",
    "Notificar gerenciadora de risco da transportadora"
  ],
  "incidentBriefing": "Resumo tático de 2 frases sobre a gravidade da situação."
}`;

    try {
      const response = await model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(`Dados do Alerta:\n${JSON.stringify(alert, null, 2)}`),
      ]);

      await logAiUsage({
        model: response.response_metadata.model,
        usage: response.response_metadata.tokenUsage,
        latencyMs: Date.now() - startTime,
        promptId: 'mesa-triage-analysis',
      });

      const parsed = cleanAndParseJson<IncidentTriageOutput>(response.content);
      const normalizedSeverity = normalizeSeverity(parsed.severityLevel);
      if (!normalizedSeverity) {
        logger.error(
          { alertId: alert.alertId, rawSeverity: parsed.severityLevel },
          'IA retornou severityLevel fora do enum esperado na triagem de sinistro — aplicando piso de segurança',
        );
      }

      const result: IncidentTriageOutput = {
        ...parsed,
        severityLevel: normalizedSeverity ?? 'P2 - Médio Risco',
      };

      return applySeverityFloor(result, alert);
    } catch (error) {
      logger.error(
        { err: error, alertId: alert.alertId },
        'Erro na triagem da mesa de tratamento — aplicando fallback determinístico de segurança',
      );
      const floor = computeSeverityFloor(alert);
      const severityLevel = floor ?? 'P2 - Médio Risco';
      const isP0 = severityLevel === 'P0 - Emergência Máxima / Sinistro Iminente';

      return {
        severityLevel,
        immediateStandardOperatingProcedure: [
          'Realizar checagem padrão de contato com o motorista e validar posição GPS.',
        ],
        shouldTriggerAutomaticLockdown: isP0,
        contactAuthorityRecommendation: isP0,
        operatorChecklist: ['Verificar histórico recente de telemetria'],
        incidentBriefing: `Alerta recebido para o veículo ${alert.vehiclePlate || 'não informado'}. Protocolo de contingência ativado. Classificação automática de contingência (IA indisponível) — validar manualmente com prioridade.`,
      };
    }
  }
}
