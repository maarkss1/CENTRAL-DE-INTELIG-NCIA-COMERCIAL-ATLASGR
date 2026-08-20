import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CentralAISuiteService } from '../CentralAISuiteService.js';

// Mock do AI Gateway para testes unitários determinísticos
vi.mock('../../../../lib/ai/gateway.js', () => ({
    getAiModel: vi.fn(() => ({
        invoke: vi.fn(async () => ({
            content: JSON.stringify({
                // mock genérico para decodificação segura
                members: [{ name: 'Carlos', role: 'Diretor', buyingRole: 'Decisor Econômico', approachStrategy: 'Foco em ROI', urgencyLevel: 'Alta' }],
                primaryTarget: 'Carlos',
                recommendations: ['Abordar primeiro o decisor econômico'],
                cleanCompanyName: 'Empresa Teste',
                commercialName: 'Empresa Teste',
                standardizedJobTitle: 'Gerente de Frotas',
                seniorityLevel: 'Gerência',
                inferredSegment: 'Transporte Rodoviário',
                dataCompletenessScore: 90,
                missingFields: [],
                suggestedTags: ['Frota Pesada'],
                subject: 'Oportunidade',
                content: 'Texto de teste',
                channel: 'email',
                callToAction: 'Vamos agendar?',
                tone: 'consultivo',
                followUpDelayDays: 3,
                personaReply: 'Olá, qual o valor da solução?',
                currentLeadInterest: 60,
                isDealClosed: false,
                isDealLost: false,
                overallScore: 85,
                strengths: ['Boa postura'],
                weaknesses: ['Preço'],
                objectionHandlingScore: 80,
                clarityScore: 90,
                closingAttemptScore: 80,
                actionableFeedback: 'Ótimo trabalho.',
                executiveSummary: 'Resumo da Proposta',
                diagnosedChallenge: 'Redução de custos',
                solutionScope: 'Módulos completos',
                projectedRoiJustification: 'Payback em 3 meses',
                implementationRoadmap: ['Fase 1'],
                closingCallToAction: 'Aguardamos retorno',
                recommendedAction: 'Enviar proposta',
                actionType: 'task',
                priority: 'Alta',
                suggestedDueDateDays: 1,
                summaryBulletPoints: ['Ponto 1'],
                churnRisk: 'Baixo',
                healthScore: 88,
                primaryRiskDrivers: [],
                immediateRetentionPlaybook: ['Manter contato'],
                executiveAlertSummary: 'Conta estável',
                recommendedRepId: 'rep_1',
                recommendedRepName: 'Ana Vendedora',
                matchScore: 95,
                matchRationale: 'Especialista no nicho',
                directAnswer: 'O módulo suporta alimentação de 9V a 36V.',
                technicalSpecifications: ['9-36V DC'],
                confidenceScore: 98,
                citedSnippetIndexes: [1],
                keyPainsIdentified: ['Sinistralidade alta'],
                agreedPoints: ['Proposta até sexta'],
                unresolvedObjections: [],
                actionItems: [{ assignee: 'Vendedor', description: 'Follow-up' }],
                sentimentScore: 'Positivo',
                severityLevel: 'P1 - Alto Risco',
                immediateStandardOperatingProcedure: ['Verificar GPS'],
                shouldTriggerAutomaticLockdown: false,
                contactAuthorityRecommendation: false,
                operatorChecklist: ['Confirmar dados'],
                incidentBriefing: 'Alerta verificado',
                motivationalHeadline: 'Excelente semana!',
                overallGrade: 'A',
                celebrationPoint: 'Bateu a meta de ligações',
                criticalGaps: [],
                actionableMicroHabits: ['Checar CRM cedo'],
                suggestedTrainingTopic: 'Negociação',
                nextWeekTargetFocus: 'Manter ritmo',
                title: 'Capítulo de Vendas',
                targetPersona: 'Diretores',
                diagnosticQuestionsSpin: { situation: [], problem: [], implication: [], needPayoff: [] },
                objectionTurnaroundScripts: [],
                goldenRules: [],
                checklistForSuccess: [],
                sanitizedText: 'Texto anonimizado',
                detectedPersonalDataTypes: ['CPF'],
                redactionCount: 1,
                complianceScore: 100,
            }),
            response_metadata: {
                model: 'deepseek-r1:8b',
                tokenUsage: { totalTokens: 150, promptTokens: 100, completionTokens: 50 },
            },
        })),
    })),
    logAiUsage: vi.fn(async () => {}),
    cleanAndParseJson: vi.fn((str: string) => {
        try {
            return JSON.parse(str);
        } catch {
            return {};
        }
    }),
}));

describe('CentralAISuiteService', () => {
    let suite: CentralAISuiteService;

    beforeEach(() => {
        suite = new CentralAISuiteService();
    });

    it('deve listar os 20 recursos no inventário de capacidades', () => {
        const inventory = suite.getCapabilitiesInventory();
        expect(inventory).toHaveLength(20);
        expect(inventory[0].name).toBe('Quebra-Gelo Inteligente');
        expect(inventory[19].name).toBe('Higienização & Anonimização LGPD');
        expect(inventory.every(item => item.ready)).toBe(true);
    });

    it('#6 DecisionCommitteeService deve mapear papéis de compra', async () => {
        const result = await suite.decisionCommittee.mapCommittee([
            { name: 'João Silva', role: 'Diretor de Operações' },
        ], 'Transportadora ABC');

        expect(result.members).toHaveLength(1);
        expect(result.primaryTarget).toBe('Carlos');
    });

    it('#7 BitrixDataHygieneService deve higienizar dados de lead', async () => {
        const result = await suite.bitrixHygiene.sanitizeLeadData({
            companyName: 'TRANSLOG LOGISTICA LTDA ME',
            jobTitle: 'coord. frota',
        });

        expect(result.cleanCompanyName).toBe('Empresa Teste');
        expect(result.dataCompletenessScore).toBe(90);
    });

    it('#8 CadenceAiService deve gerar próximo passo da cadência', async () => {
        const result = await suite.cadenceAI.generateNextStep({
            companyName: 'Alfa Cargas',
            contactName: 'Marcos',
            channel: 'email',
            stepNumber: 1,
        });

        expect(result.channel).toBe('email');
        expect(result.tone).toBe('consultivo');
    });

    it('#9 RoleplayAiService deve simular cliente e avaliar sessão', async () => {
        const persona = {
            name: 'Roberto',
            role: 'CFO',
            companyProfile: 'Frota de 50 caminhões',
            difficulty: 'Difícil' as const,
            mainObjection: 'Custo',
            personality: 'Pragmático',
        };

        const turn = await suite.roleplayAI.simulateCustomerResponse({
            persona,
            history: [],
            userMessage: 'Olá Roberto, temos telemetria com redução de custo garantida.',
        });

        expect(turn.currentLeadInterest).toBe(60);

        const evalResult = await suite.roleplayAI.evaluateSession(persona, [
            { sender: 'user', text: 'Proposta de valor' },
            { sender: 'persona', text: 'Qual o preço?' },
        ]);

        expect(evalResult.overallScore).toBe(85);
    });

    it('#10 ProposalAiService deve gerar seções da proposta', async () => {
        const result = await suite.proposalAI.generateProposalSections({
            clientName: 'Beta Transportes',
            diagnosedPains: ['Roubo frequente'],
            proposedModules: ['Trava de Baú', 'Bloqueio Progressivo'],
        });

        expect(result.executiveSummary).toBe('Resumo da Proposta');
        expect(result.implementationRoadmap).toHaveLength(1);
    });

    it('#11 NextBestActionService deve sugerir próximo passo pós-ligação', async () => {
        const result = await suite.nextBestAction.determineNextAction({
            leadOrClientName: 'Gama Log',
            stage: 'Negociação',
            rawNote: 'Cliente pediu desconto de 5% para fechar 20 placas hoje.',
        });

        expect(result.recommendedAction).toBe('Enviar proposta');
        expect(result.priority).toBe('Alta');
    });

    it('#13 ChurnPredictionService deve calcular risco de cancelamento', async () => {
        const result = await suite.churnPrediction.analyzeChurnRisk({
            clientName: 'Delta Logística',
            contractAgeMonths: 14,
            monthlyRecurringRevenue: 5000,
            openSupportTickets: 0,
            unresolvedComplaints: 0,
            paymentDelaysLast90Days: 0,
            platformUsageDropPercentage: 5,
        });

        expect(result.churnRisk).toBe('Baixo');
        expect(result.healthScore).toBe(88);
    });

    it('#14 SmartLeadRouterService deve selecionar o melhor vendedor', async () => {
        const result = await suite.leadRouter.matchLeadToRep(
            {
                leadId: 'l1',
                companyName: 'Omega Transportes',
                estimatedFleet: 40,
                segment: 'Frota Pesada',
                urgency: 'Alta',
                region: 'Sudeste',
            },
            [
                { repId: 'rep_1', name: 'Ana Vendedora', specialties: ['Frota Pesada'], winRatePercent: 35, currentLeadCount: 10 },
            ]
        );

        expect(result.recommendedRepId).toBe('rep_1');
        expect(result.matchScore).toBe(95);
    });

    it('#15 KnowledgeCopilotService deve responder dúvidas técnicas com citação real resolvida do hit', async () => {
        const result = await suite.knowledgeCopilot.answerTechnicalQuestion({
            question: 'Qual a voltagem do módulo Atlas?',
            hits: [{
                chunkId: 'chunk-1',
                documentId: 'doc-1',
                documentTitle: 'Manual Técnico Atlas',
                content: 'Alimentação 9-36V DC',
                chunkIndex: 0,
                matchedBy: ['semantic'],
                similarity: 0.9,
                score: 0.5,
            }],
        });

        expect(result.confidenceScore).toBe(98);
        expect(result.technicalSpecifications).toContain('9-36V DC');
        // AI-010: a citação vem do metadado real do hit (índice 1 resolvido de volta), nunca de
        // texto que o LLM tenha inventado.
        expect(result.sourceReferences).toEqual([
            { documentId: 'doc-1', chunkId: 'chunk-1', documentTitle: 'Manual Técnico Atlas', chunkIndex: 0, score: 0.5 },
        ]);
    });

    it('#16 MeetingSynthesisService deve sintetizar reuniões', async () => {
        const result = await suite.meetingSynthesis.synthesizeMeeting({
            meetingTitle: 'Demonstração de Telemetria',
            participants: ['Vendedor Atlas', 'Diretor Logística'],
            rawTranscript: 'Vendedor: Olá. Diretor: Gostei da telemetria.',
        });

        expect(result.sentimentScore).toBe('Positivo');
        expect(result.actionItems).toHaveLength(1);
    });

    it('#17 MesaTriageService deve classificar severidade de ocorrência', async () => {
        const result = await suite.mesaTriage.triageIncident({
            alertId: 'alt_1',
            clientName: 'Frota Segura',
            alertType: 'Violação de Trava de Baú',
            telemetryDataSummary: 'Sensor de porta traseira violado em rodovia',
        });

        expect(result.severityLevel).toBe('P1 - Alto Risco');
    });

    it('#18 SellerCoachingService deve gerar relatório semanal', async () => {
        const result = await suite.sellerCoaching.generateCoachingReport({
            sellerName: 'Pedro Vendedor',
            role: 'SDR / Hunter',
            period: 'Semana 34',
            callsMade: 150,
            connectionsRatePercent: 40,
            meetingsScheduled: 12,
            proposalsSent: 6,
            dealsClosed: 3,
            conversionRatePercent: 25,
            avgTicket: 3500,
        });

        expect(result.overallGrade).toBe('A');
    });

    it('#19 PlaybookAiService deve gerar capítulos estruturados', async () => {
        const result = await suite.playbookAI.generatePlaybookChapter({
            topic: 'Objeção de Preço',
            targetAudience: 'Closer',
            industrySegment: 'Grãos e Agro',
        });

        expect(result.title).toBe('Capítulo de Vendas');
    });

    it('#20 LgpdSanitizerService deve anonimizar dados pessoais', async () => {
        const result = await suite.lgpdSanitizer.sanitizeText({
            rawText: 'O motorista José da Silva, CPF 123.456.789-00 e telefone 11 99999-8888 relatou atraso.',
            maskLevel: 'estrito',
        });

        expect(result.complianceScore).toBe(100);
        expect(result.detectedPersonalDataTypes).toContain('CPF');
    });
});
