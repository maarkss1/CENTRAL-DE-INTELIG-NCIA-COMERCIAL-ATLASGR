import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { cleanAndParseJson, getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { logger } from '../../../lib/logger.js';

export interface ContactInput {
    name: string;
    role?: string;
    email?: string;
    phone?: string;
    department?: string;
}

export interface ClassifiedDecisionMaker {
    name: string;
    role: string;
    buyingRole: 'Decisor Econômico' | 'Decisor Operacional' | 'Influenciador Técnico' | 'Usuário Final' | 'Bloqueador Potencial';
    approachStrategy: string;
    urgencyLevel: 'Alta' | 'Média' | 'Baixa';
}

export interface CommitteeAnalysisResult {
    companyContext?: string;
    members: ClassifiedDecisionMaker[];
    primaryTarget: string;
    recommendations: string[];
}

export class DecisionCommitteeService {
    async mapCommittee(contacts: ContactInput[], companyContext?: string): Promise<CommitteeAnalysisResult> {
        if (!contacts || contacts.length === 0) {
            return { members: [], primaryTarget: '', recommendations: ['Nenhum contato fornecido para análise.'] };
        }

        const model = getAiModel('local-llama3-fast', 0.2, 'decision-committee');
        const startTime = Date.now();

        const systemPrompt = `Você é um especialista sênior em Vendas B2B Complexas e Engenharia de Contas (Account-Based Marketing).
Analise a lista de contatos de uma empresa alvo e mapeie o Comitê de Decisão de Compra para soluções de Rastreamento, Telemetria e Gestão de Riscos Logísticos (AtlasGR / TotalTrac).
Para cada contato, classifique o papel de compra (buyingRole) em:
- "Decisor Econômico" (ex: Diretor Geral, CFO, Dono)
- "Decisor Operacional" (ex: Diretor de Logística, Gerente de Frotas, Gerente de Operações)
- "Influenciador Técnico" (ex: Gerente de TI, Coordenador de Segurança, Engenheiro de Manutenção)
- "Usuário Final" (ex: Operador de Central, Motorista Líder, Monitor de Rota)
- "Bloqueador Potencial" (ex: Compras sem foco em qualidade)

Retorne SEMPRE e APENAS um JSON válido no seguinte formato:
{
  "members": [
    {
      "name": "Nome",
      "role": "Cargo",
      "buyingRole": "Decisor Operacional",
      "approachStrategy": "Como abordar este perfil com foco em dor operacional...",
      "urgencyLevel": "Alta"
    }
  ],
  "primaryTarget": "Nome do contato principal para a 1ª abordagem",
  "recommendations": [
    "Dica prática 1",
    "Dica prática 2"
  ]
}`;

        try {
            const response = await model.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(`Contexto da Empresa: ${companyContext || 'Empresa de Transporte e Logística'}\n\nContatos:\n${JSON.stringify(contacts, null, 2)}`),
            ]);

            await logAiUsage({
                model: response.response_metadata.model,
                usage: response.response_metadata.tokenUsage,
                latencyMs: Date.now() - startTime,
                promptId: 'decision-committee-mapping',
            });

            const parsed = cleanAndParseJson<CommitteeAnalysisResult>(response.content);
            return {
                ...parsed,
                companyContext,
            };
        } catch (error) {
            logger.error({ err: error }, 'Erro ao mapear comitê de decisão');
            return {
                companyContext,
                members: contacts.map(c => ({
                    name: c.name,
                    role: c.role || 'Não especificado',
                    buyingRole: 'Decisor Operacional',
                    approachStrategy: 'Validar influência no processo de compras.',
                    urgencyLevel: 'Média',
                })),
                primaryTarget: contacts[0]?.name || '',
                recommendations: ['Análise de IA temporariamente indisponível. Classificação de contingência aplicada.'],
            };
        }
    }
}
