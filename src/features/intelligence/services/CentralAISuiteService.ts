/**
 * Central de Inteligência Comercial — AtlasGR & TotalTrac
 * 
 * Suíte Centralizada de IA que unifica e orquestra os 20 recursos de IA da plataforma:
 * 1.  🧊 Icebreaker & Hook Personalizado (Prospecção)
 * 2.  📜 Gerador de Scripts & Pitches Comerciais
 * 3.  💬 Inteligência de Conversas de WhatsApp
 * 4.  📊 Resumos Executivos Diários Automáticos
 * 5.  🎯 Lead Scoring & ICP Fit Preditivo
 * 6.  👥 Mapeamento de Comitê de Compra & Decisores
 * 7.  🔄 Normalização & Higienização Bitrix24
 * 8.  ⏱️ Cadência & Follow-Up Dinâmico
 * 9.  🎭 Simulador de Negociação / Roleplay de SDR
 * 10. 📝 Gerador de Propostas Comerciais & ROI
 * 11. ✅ Assistente Next Best Action Pós-Contato
 * 12. 📉 Análise de Ganhos e Perdas (Win-Loss Analysis)
 * 13. ⚠️ Detector de Churn & Health Score de Contas
 * 14. 🧭 Roteamento Inteligente de Leads (Smart Match)
 * 15. 📖 Copiloto Técnico de Soluções & RAG
 * 16. 🎙️ Transcrição e Ata de Reuniões Comerciais
 * 17. 🚨 Triagem de Ocorrências na Mesa de Tratamento
 * 18. 🏆 Coaching Semanal de Performance de Vendedores
 * 19. 📘 Gerador de Playbooks de Vendas
 * 20. 🛡️ Higienização & Anonimização LGPD
 */

import { IcebreakerService } from './IcebreakerService.js';
import { CommercialAIService } from './CommercialAIService.js';
import { ConversationIntelligenceService } from '../../integrations/whatsapp/conversation-intelligence.service.js';
import { DecisionCommitteeService } from '../../contacts/services/decision-committee.service.js';
import { BitrixDataHygieneService } from '../../integrations/bitrix/services/bitrix-data-hygiene.service.js';
import { CadenceAiService } from '../../cadence/infra/services/cadence-ai.service.js';
import { RoleplayAiService } from '../../roleplay/services/roleplay-ai.service.js';
import { ProposalAiService } from '../../document-editor/services/proposal-ai.service.js';
import { NextBestActionService } from '../../activities/services/next-best-action.service.js';
import { ChurnPredictionService } from '../../analytics/services/churn-prediction.service.js';
import { SmartLeadRouterService } from '../../automations/services/smart-lead-router.service.js';
import { KnowledgeCopilotService } from '../../knowledge/services/knowledge-copilot.service.js';
import { MeetingSynthesisService } from '../../chatbook/services/meeting-synthesis.service.js';
import { MesaTriageService } from '../../mesa-tratamento/services/mesa-triage.service.js';
import { SellerCoachingService } from '../../gamification/services/seller-coaching.service.js';
import { PlaybookAiService } from '../../playbook/services/playbook-ai.service.js';
import { LgpdSanitizerService } from '../../lgpd/services/lgpd-sanitizer.service.js';

export class CentralAISuiteService {
    // #1 Icebreaker
    public readonly icebreaker = new IcebreakerService();

    // #2 Scripts & Pitches
    public readonly commercialAI = new CommercialAIService();

    // #3 WhatsApp Intelligence
    public readonly conversationIntelligence = new ConversationIntelligenceService();

    // #6 Comitê de Compra
    public readonly decisionCommittee = new DecisionCommitteeService();

    // #7 Bitrix Data Hygiene
    public readonly bitrixHygiene = new BitrixDataHygieneService();

    // #8 Cadência Dinâmica
    public readonly cadenceAI = new CadenceAiService();

    // #9 Roleplay & Treinamento
    public readonly roleplayAI = new RoleplayAiService();

    // #10 Propostas & ROI
    public readonly proposalAI = new ProposalAiService();

    // #11 Next Best Action
    public readonly nextBestAction = new NextBestActionService();

    // #13 Churn & Health Score
    public readonly churnPrediction = new ChurnPredictionService();

    // #14 Smart Lead Router
    public readonly leadRouter = new SmartLeadRouterService();

    // #15 Copiloto RAG Técnico
    public readonly knowledgeCopilot = new KnowledgeCopilotService();

    // #16 Ata de Reuniões
    public readonly meetingSynthesis = new MeetingSynthesisService();

    // #17 Triagem Mesa de Tratamento
    public readonly mesaTriage = new MesaTriageService();

    // #18 Coaching de Vendas
    public readonly sellerCoaching = new SellerCoachingService();

    // #19 Playbook de Vendas
    public readonly playbookAI = new PlaybookAiService();

    // #20 Sanitizador LGPD
    public readonly lgpdSanitizer = new LgpdSanitizerService();

    /**
     * Retorna a lista dos 20 recursos de IA ativos na plataforma e seu status operacional
     */
    getCapabilitiesInventory() {
        return [
            { id: 1, name: 'Quebra-Gelo Inteligente', domain: 'Prospecting', ready: true },
            { id: 2, name: 'Gerador de Scripts e Pitches', domain: 'Commercial Intelligence', ready: true },
            { id: 3, name: 'Inteligência de WhatsApp', domain: 'Integrations', ready: true },
            { id: 4, name: 'Resumos Executivos Diários', domain: 'CRM / Workers', ready: true },
            { id: 5, name: 'Lead Scoring & Fit com ICP', domain: 'Prospecting / Graphs', ready: true },
            { id: 6, name: 'Mapeamento de Comitê de Compra', domain: 'Contacts', ready: true },
            { id: 7, name: 'Normalização de Dados Bitrix24', domain: 'Integrations / Bitrix', ready: true },
            { id: 8, name: 'Cadência & Follow-Up Dinâmico', domain: 'Cadence', ready: true },
            { id: 9, name: 'Simulador de Negociação (Roleplay)', domain: 'Roleplay', ready: true },
            { id: 10, name: 'Gerador de Propostas Comerciais & ROI', domain: 'Document Editor', ready: true },
            { id: 11, name: 'Assistente Next Best Action', domain: 'Activities / Notes', ready: true },
            { id: 12, name: 'Análise de Ganho e Perda (Win-Loss)', domain: 'Intelligence / Workers', ready: true },
            { id: 13, name: 'Detector de Churn & Health Score', domain: 'Analytics', ready: true },
            { id: 14, name: 'Roteamento Inteligente de Leads', domain: 'Automations', ready: true },
            { id: 15, name: 'Copiloto Técnico de Manuais & RAG', domain: 'Knowledge', ready: true },
            { id: 16, name: 'Transcrição e Ata de Reuniões', domain: 'Chatbook', ready: true },
            { id: 17, name: 'Triagem na Mesa de Tratamento', domain: 'Mesa de Tratamento', ready: true },
            { id: 18, name: 'Coaching Semanal de Vendedores', domain: 'Gamification / Team', ready: true },
            { id: 19, name: 'Gerador de Playbooks de Vendas', domain: 'Playbook', ready: true },
            { id: 20, name: 'Higienização & Anonimização LGPD', domain: 'LGPD / Compliance', ready: true },
        ];
    }
}

export const aiSuite = new CentralAISuiteService();
