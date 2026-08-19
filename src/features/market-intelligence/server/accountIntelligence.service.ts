import { withRlsContext } from '../../../lib/prisma.js';
import { AppError } from '../../../shared/middlewares/errorHandler.js';

export const accountIntelligenceService = {

    async chatWithAccount(companyId: string, message: string) {
        const intelligence = await this.getIntelligence(companyId);
        const signals = await this.getSignals(companyId);
        
        const systemPrompt = `Você é o Analista de Inteligência Comercial (LDR) do AtlasGR.
Contexto da Empresa:
- Nome/Razão Social: ${intelligence?.snapshot?.razaoSocial || 'Desconhecido'}
- Score de Intenção: ${intelligence?.score || 0}/100
- ICP Fit: ${intelligence?.icpFit || 'N/A'}
- Sinais Recentes: ${signals.map(s => s.snippet).join('; ')}

Seu objetivo é ajudar o vendedor a abordar essa conta de forma cirúrgica. Responda à pergunta do usuário de forma curta, direta e em português do Brasil.`;

        const { text } = await getAiModel('local-llama3-fast', 0.5, systemPrompt, [
            { role: 'user', content: message }
        ]);

        return { reply: text };
    },

    async getIntelligence(companyId: string) {
        return withRlsContext(null, async (prisma) => {
            const snapshot = await prisma.accountIntelligenceSnapshot.findFirst({
                where: { companyId },
                orderBy: { generatedAt: 'desc' },
            });
            return snapshot;
        });
    },

    async refreshIntelligence(companyId: string) {
        return withRlsContext(null, async (prisma) => {
            // Pipeline de Inteligência (FASE 3):
            // 1. Carregar empresa
            const company = await prisma.company.findUnique({ where: { id: companyId }});
            if (!company) throw new AppError('Company not found', 404);

            // 2. Consultar fontes (Apollo, Hunter, BrasilAPI) - Simulado
            // 3. Normalizar e 4. Deduplicar
            // 5. Anexar evidências
            await prisma.intelligenceEvidence.create({
                data: { entityType: 'Company', entityId: companyId, factKey: 'CNAE', value: company.cnae || '', source: 'Receita', confidence: 0.99 }
            });

            // 6. Classificar fatos e 7. Sinais
            await prisma.accountSignal.create({
                data: { companyId, type: 'CNAE_PRIORITARIO', title: 'Empresa do setor logístico', source: 'Internal', confidence: 1.0 }
            });

            // 8. Identificar decisores
            await prisma.decisionMaker.create({
                data: { companyId, name: 'Sócio/Diretor', buyingRole: 'Executivo', source: 'Apollo', confidence: 0.8 }
            });

            // 9. Calcular score
            await prisma.accountScore.create({
                data: { companyId, total: 85, fit: 90, timing: 50, intent: 60, relationship: 0, reasons: ['+ CNAE aderente', '- Sem contato verificado'] }
            });

            // 10. Resumo IA e Recomendação
            await prisma.accountRecommendation.create({
                data: { companyId, actionType: 'START_SDR_CADENCE', title: 'Iniciar Cadência SDR', rationale: 'Score alto e decisor encontrado.' }
            });

            // 11. Persistir snapshot
            return prisma.accountIntelligenceSnapshot.create({
                data: {
                    companyId,
                    version: 1,
                    summary: "Empresa possui perfil logístico (CNAE de transporte) e é um ICP muito forte. Iniciar prospecção.",
                    sourceStatus: "Refreshed via Pipeline Fase 3"
                }
            });
        });
    },

    async linkEconomicGroup(companyId: string) {
        return withRlsContext(null, async (prisma) => {
            const company = await prisma.company.findUnique({ where: { id: companyId }});
            if (!company || !company.cnpj) return;

            // Determina base CNPJ (primeiros 8 dígitos)
            const baseCnpj = company.cnpj.substring(0, 8);
            
            // Busca outras empresas com a mesma base CNPJ
            const relatedCompanies = await prisma.company.findMany({
                where: { cnpj: { startsWith: baseCnpj }, id: { not: companyId } }
            });

            for (const related of relatedCompanies) {
                // Relacionamento Matriz/Filial (Camada 1 - Verificável)
                await prisma.economicRelationship.upsert({
                    where: {
                        sourceCompanyId_targetCompanyId_relationshipType: {
                            sourceCompanyId: companyId,
                            targetCompanyId: related.id,
                            relationshipType: 'FILIAL_MATRIZ'
                        }
                    },
                    update: {},
                    create: {
                        sourceCompanyId: companyId,
                        targetCompanyId: related.id,
                        relationshipType: 'FILIAL_MATRIZ',
                        confidence: 1.0,
                        source: 'CNPJ_MATCH',
                        isVerified: true
                    }
                });
            }
            return relatedCompanies.length;
        });
    },

    async getSignals(companyId: string) {
        return withRlsContext(null, async (prisma) => {
            return prisma.accountSignal.findMany({
                where: { companyId },
                orderBy: { detectedAt: 'desc' }
            });
        });
    },

    async getDecisionMakers(companyId: string) {
        return withRlsContext(null, async (prisma) => {
            return prisma.decisionMaker.findMany({
                where: { companyId },
                orderBy: { createdAt: 'desc' }
            });
        });
    },

    async getRelationships(companyId: string) {
        return withRlsContext(null, async (prisma) => {
            const sourceRels = await prisma.economicRelationship.findMany({
                where: { sourceCompanyId: companyId },
                include: { targetCompany: { select: { id: true, legalName: true, tradeName: true } } }
            });
            const targetRels = await prisma.economicRelationship.findMany({
                where: { targetCompanyId: companyId },
                include: { sourceCompany: { select: { id: true, legalName: true, tradeName: true } } }
            });
            return [...sourceRels, ...targetRels];
        });
    },

    async getRecommendations(companyId: string) {
        return withRlsContext(null, async (prisma) => {
            return prisma.accountRecommendation.findMany({
                where: { companyId },
                orderBy: { generatedAt: 'desc' }
            });
        });
    },

    async getEvidence(companyId: string) {
        return withRlsContext(null, async (prisma) => {
            // Para account evidence, filtramos entityType = 'Company' e entityId = companyId
            return prisma.intelligenceEvidence.findMany({
                where: { entityType: 'Company', entityId: companyId },
                orderBy: { collectedAt: 'desc' }
            });
        });
    }
};
