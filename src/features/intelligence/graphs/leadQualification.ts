import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { getAiModel, logAiUsage, cleanAndParseJson } from '../../../lib/ai/gateway.js';
import { prisma } from '../../../lib/prisma.js';

// Achado da auditoria (PR #328, item fora de escopo original): o parse da resposta do LLM abaixo
// só fazia `result.score` opcional/`typeof` manual — um JSON malformado ou sem "score" caía no
// mesmo `catch` de falha de rede, mas um JSON válido com "score" como string (ex.: "85") ou um
// "summary" ausente passava sem barrar, silenciosamente. `.partial()` porque o próprio código já
// tinha fallback por campo faltando — o schema só formaliza esse fallback em vez de confiar em
// `typeof` ad-hoc.
const qualificationResponseSchema = z.object({ score: z.number(), summary: z.string() }).partial();

// Define the state for the graph
const LeadQualificationState = Annotation.Root({
  leadId: Annotation<string>(),
  companyInfo: Annotation<string>(),
  qualificationScore: Annotation<number>(),
  summary: Annotation<string>(),
  status: Annotation<string>(),
});

export const leadQualificationGraph = new StateGraph(LeadQualificationState)
  .addNode('research', async (state) => {
    // Se quem chamou já informou uma descrição real da empresa, respeitamos ela.
    // Só buscamos os dados reais no banco quando nada foi passado.
    if (state.companyInfo && state.companyInfo.trim().length > 0) {
      return {};
    }

    const lead = await prisma.lead.findUnique({
      where: { id: state.leadId },
      include: { company: true, contact: true },
    });

    if (!lead?.company) {
      return { companyInfo: 'Nenhuma informação disponível sobre esta empresa no CRM.' };
    }

    const c = lead.company;
    const p = lead.contact;
    const parts = [
      `Empresa: ${c.tradeName}`,
      c.segment && `Segmento: ${c.segment}`,
      (c.city || c.state) && `Localização: ${[c.city, c.state].filter(Boolean).join(', ')}`,
      c.size && `Porte: ${c.size}${c.employeeCount ? ` (~${c.employeeCount} funcionários)` : ''}`,
      c.situacaoCadastral && `Situação cadastral (Receita Federal): ${c.situacaoCadastral}`,
      c.technologies?.length
        ? `Tecnologias em uso: ${c.technologies.slice(0, 6).join(', ')}`
        : null,
      c.googleRating != null
        ? `Reputação no Google: nota ${c.googleRating} (${c.googleReviewsCount ?? 0} avaliações)`
        : null,
      c.observations && `Resumo do enriquecimento: ${c.observations}`,
      p && `Contato/decisor: ${p.name}${p.role ? `, ${p.role}` : ''}`,
    ].filter(Boolean);

    const companyInfo =
      parts.length > 0
        ? parts.join(' | ')
        : 'Empresa cadastrada sem dados de enriquecimento ainda.';

    return { companyInfo };
  })
  .addNode('analyze', async (state) => {
    const model = getAiModel('local-llama3', 0.2, 'leadQualification');
    const startTime = Date.now();

    const response = await model.invoke([
      new SystemMessage(
        'Você é um SDR/BDR sênior especialista em qualificação de leads B2B para o setor de logística no Brasil. Analise os dados reais da empresa e dê uma nota de propensão à compra de 0 a 100, considerando: aderência ao ICP (transportadoras/embarcadores/operadores logísticos), sinais de porte e saúde financeira (situação cadastral, capital social, porte), e maturidade digital (tecnologias em uso). Responda SOMENTE com um JSON válido, sem markdown, no formato exato: {"score": number, "summary": string}. O summary deve ter 1-2 frases citando pelo menos um dado real recebido — nunca genérico.',
      ),
      new HumanMessage(`Dados da empresa: ${state.companyInfo}`),
    ]);

    await logAiUsage({
      model: response.response_metadata.model,
      usage: response.response_metadata.tokenUsage,
      latencyMs: Date.now() - startTime,
    });

    try {
      const result = qualificationResponseSchema.parse(
        cleanAndParseJson<unknown>(response.content as string),
      );
      const score =
        typeof result.score === 'number' ? Math.max(0, Math.min(100, result.score)) : 50;
      return {
        qualificationScore: score,
        summary: result.summary || 'Sem resumo gerado pela IA.',
        status: score >= 70 ? 'QUALIFIED' : 'UNQUALIFIED',
      };
    } catch {
      return {
        qualificationScore: 50,
        summary: 'Falha ao interpretar a resposta da IA — verifique manualmente.',
        status: 'UNQUALIFIED',
      };
    }
  })
  .addEdge(START, 'research')
  .addEdge('research', 'analyze')
  .addEdge('analyze', END);

export const compileLeadGraph = () => leadQualificationGraph.compile();
