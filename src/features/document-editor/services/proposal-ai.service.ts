import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { cleanAndParseJson, getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { logger } from '../../../lib/logger.js';

export interface ProposalInput {
    clientName: string;
    fleetSize?: number;
    diagnosedPains: string[];
    proposedModules: string[];
    monthlyInvestmentEstimated?: number;
    competitorOrCurrentSolution?: string;
}

export interface GeneratedProposalContent {
    executiveSummary: string;
    diagnosedChallenge: string;
    solutionScope: string;
    projectedRoiJustification: string;
    implementationRoadmap: string[];
    closingCallToAction: string;
}

export class ProposalAiService {
    async generateProposalSections(input: ProposalInput): Promise<GeneratedProposalContent> {
        const model = getAiModel('local-llama3-fast', 0.3, 'proposal-ai');
        const startTime = Date.now();

        const systemPrompt = `Você é um Consultor Sênior de Soluções Comerciais e ROI da AtlasGR / TotalTrac.
Sua missão é redigir o corpo executivo de uma Proposta Comercial B2B personalizada para um cliente de transporte/logística.
Destaque:
1. Resumo Executivo elegante e focado em valor estratégico.
2. Diagnóstico claro dos desafios operacionais levantados.
3. Escopo da solução explicando por que os módulos propostos resolvem a dor.
4. Justificativa de ROI convincente (redução de sinistro, economia de combustível, redução de paradas não programadas).
5. Roadmap de implantação em fases.

Retorne SEMPRE e APENAS um JSON válido no formato:
{
  "executiveSummary": "Texto do resumo executivo...",
  "diagnosedChallenge": "Texto do diagnóstico...",
  "solutionScope": "Descrição clara dos módulos e benefícios...",
  "projectedRoiJustification": "Cálculo e narrativa do retorno sobre o investimento...",
  "implementationRoadmap": [
    "Fase 1: Mapeamento e Configuração de Sensores (Semana 1)",
    "Fase 2: Instalação e Testes de Bancada (Semana 2)",
    "Fase 3: Treinamento da Central e Go-Live (Semana 3)"
  ],
  "closingCallToAction": "Próximos passos e validação da minuta"
}`;

        try {
            const response = await model.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(`Dados do Cliente e Negociação:\n${JSON.stringify(input, null, 2)}`),
            ]);

            await logAiUsage({
                model: response.response_metadata.model,
                usage: response.response_metadata.tokenUsage,
                latencyMs: Date.now() - startTime,
                promptId: 'proposal-generation',
            });

            return cleanAndParseJson<GeneratedProposalContent>(response.content);
        } catch (error) {
            logger.error({ err: error }, 'Erro ao gerar seções da proposta');
            return {
                executiveSummary: `Apresentamos a proposta comercial customizada para a ${input.clientName}, com foco na otimização da segurança e eficiência de frota.`,
                diagnosedChallenge: input.diagnosedPains.join(', ') || 'Necessidade de maior visibilidade operacional e redução de sinistros.',
                solutionScope: `Implantação dos módulos: ${input.proposedModules.join(', ')}.`,
                projectedRoiJustification: 'Estimativa de redução substancial nos custos de sinistralidade e paradas operacionais.',
                implementationRoadmap: ['Fase 1: Alinhamento', 'Fase 2: Instalação', 'Fase 3: Operação'],
                closingCallToAction: 'Aguardamos a validação para emissão dos termos finais.',
            };
        }
    }
}
