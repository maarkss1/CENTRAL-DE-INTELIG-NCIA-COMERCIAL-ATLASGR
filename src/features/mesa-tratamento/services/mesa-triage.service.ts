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

export interface IncidentTriageOutput {
    severityLevel: 'P0 - Emergência Máxima / Sinistro Iminente' | 'P1 - Alto Risco' | 'P2 - Médio Risco' | 'P3 - Informativo / Operacional';
    immediateStandardOperatingProcedure: string[];
    shouldTriggerAutomaticLockdown: boolean;
    contactAuthorityRecommendation: boolean;
    operatorChecklist: string[];
    incidentBriefing: string;
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

            return cleanAndParseJson<IncidentTriageOutput>(response.content);
        } catch (error) {
            logger.error({ err: error }, 'Erro na triagem da mesa de tratamento');
            return {
                severityLevel: alert.alertType.includes('Pânico') || alert.alertType.includes('Jammer')
                    ? 'P0 - Emergência Máxima / Sinistro Iminente'
                    : 'P2 - Médio Risco',
                immediateStandardOperatingProcedure: ['Realizar checagem padrão de contato com o motorista e validar posição GPS.'],
                shouldTriggerAutomaticLockdown: false,
                contactAuthorityRecommendation: false,
                operatorChecklist: ['Verificar histórico recente de telemetria'],
                incidentBriefing: `Alerta recebido para o veículo ${alert.vehiclePlate || 'não informado'}. Protocolo de contingência ativado.`,
            };
        }
    }
}
