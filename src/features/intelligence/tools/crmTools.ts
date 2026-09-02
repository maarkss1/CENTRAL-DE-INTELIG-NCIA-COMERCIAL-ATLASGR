import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma.js';
import type { Prisma } from '@prisma/client';
import { toPrismaLeadStatus, fromPrismaLeadStatus } from '../../../lib/enumMap';
import { LEAD_STATUS, type LeadStatus } from '../../../lib/zod.js';
import { getTenantId } from '../../../lib/async-context.js';
import { minimizePii } from '../services/guardrails.service.js';

/**
 * Ferramenta para o agente ENCONTRAR o(s) Lead(s) certo(s) quando a instrução menciona uma
 * empresa/contato pelo nome (ou só um status/filtro) em vez de já trazer um ID pronto — sem isto,
 * qualquer instrução que não viesse com um leadId explícito batia num beco sem saída ("me passe o
 * ID do lead"), mesmo quando o dado já existe no CRM e só precisava ser localizado por nome.
 */
export const searchLeadsTool = tool(
  async ({ query, status, limit }: { query?: string; status?: string; limit?: number }) => {
    const organizationId = getTenantId();
    if (!organizationId) {
      return 'Erro: contexto de organização ausente — não é possível buscar leads com segurança.';
    }

    const take = Math.min(Math.max(limit ?? 10, 1), 20);
    const trimmedQuery = query?.trim();

    const leads = await prisma.lead.findMany({
      where: {
        organizationId,
        ...(status ? { status: toPrismaLeadStatus(status as LeadStatus) as never } : {}),
        ...(trimmedQuery
          ? {
              OR: [
                { company: { is: { tradeName: { contains: trimmedQuery, mode: 'insensitive' } } } },
                { company: { is: { legalName: { contains: trimmedQuery, mode: 'insensitive' } } } },
                { contact: { is: { name: { contains: trimmedQuery, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      include: { company: true, contact: true },
      orderBy: { lastInteraction: 'desc' },
      take,
    });

    if (leads.length === 0) {
      return 'Nenhum lead encontrado com esses critérios. Confirme o nome da empresa/contato ou peça o ID diretamente.';
    }

    const lines = leads.map(
      (l) =>
        `- ID: ${l.id} | Empresa: ${l.company?.tradeName ?? 'Desconhecida'} | Contato: ${l.contact?.name ?? '—'} | Status: ${fromPrismaLeadStatus(l.status)}`,
    );
    const disambiguationHint =
      leads.length > 1
        ? '\n\nMais de um lead corresponde à busca — confirme qual antes de agir, ou peça mais detalhes se não estiver claro.'
        : '';
    const result = `Encontrado(s) ${leads.length} lead(s):\n${lines.join('\n')}${disambiguationHint}`;

    // SEC-013b: mesmo tratamento de get_lead_context — este texto vira uma ToolMessage
    // devolvida ao LLM externo (Groq/OpenAI) dentro do loop de tool-calling; sem isto, o
    // nome real de cada contato encontrado ia direto pro provedor só por buscar por nome
    // de empresa/lead sem leadId pronto.
    const contactTokens: Array<{ token: string; value: string }> = [];
    for (const l of leads) {
      if (l.contact?.name) {
        contactTokens.push({ token: '[NOME_DO_CONTATO]', value: l.contact.name });
      }
    }
    return contactTokens.length > 0 ? minimizePii(result, contactTokens).text : result;
  },
  {
    name: 'search_leads',
    description:
      'Busca leads existentes no CRM por nome de empresa (razão social ou fantasia), nome do contato e/ou status — use SEMPRE que a instrução mencionar uma empresa/pessoa/lead pelo nome em vez de trazer um ID pronto. Retorna o ID real de cada lead encontrado para usar em seguida com get_lead_context ou as demais ferramentas. Nunca invente um leadId: se a busca não retornar nada, informe isso ao usuário em vez de inventar um ID.',
    schema: z.object({
      query: z
        .string()
        .optional()
        .describe(
          'Texto livre para buscar por nome da empresa (razão social/fantasia) ou nome do contato',
        ),
      status: z.enum(LEAD_STATUS).optional().describe('Filtrar por status atual do lead'),
      limit: z.number().min(1).max(20).optional().describe('Máximo de resultados (padrão 10)'),
    }),
  },
);

/**
 * Ferramenta para o agente buscar o contexto completo de um Lead (empresa, contato, interações)
 */
export const getLeadContextTool = tool(
  async ({ leadId }: { leadId: string }) => {
    // Sem isto, qualquer tenant que soubesse (ou adivinhasse) um ID de Lead conseguia ler dados
    // de outra organização através deste tool — o agente SDR roda dentro do contexto da
    // requisição que o disparou, então getTenantId() aqui é o tenant de quem pediu a qualificação.
    const organizationId = getTenantId();
    if (!organizationId) {
      return 'Erro: contexto de organização ausente — não é possível buscar o lead com segurança.';
    }

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId },
      include: { company: true, contact: true },
    });

    if (!lead) {
      return 'Erro: Lead não encontrado no CRM.';
    }

    const c = lead.company;
    const p = lead.contact;

    let context = `Lead ID: ${lead.id}\nStatus atual: ${lead.status}\n`;

    if (c) {
      context += `Empresa: ${c.tradeName}\n`;
      context += `Segmento: ${c.segment || 'Desconhecido'}\n`;
      context += `Porte: ${c.size || 'Desconhecido'}\n`;
      context += `Situação Cadastral: ${c.situacaoCadastral || 'Desconhecido'}\n`;
      context += `Tecnologias: ${c.technologies?.join(', ') || 'Nenhuma identificada'}\n`;
      context += `Resumo Enriquecimento: ${c.observations || 'Nenhum'}\n`;
    }

    if (p) {
      context += `\nContato: ${p.name} (${p.role || 'Cargo desconhecido'})\n`;
    }

    // SEC-013b: este texto vira uma ToolMessage devolvida ao LLM externo (Groq/OpenAI)
    // dentro do loop de tool-calling do agente — sem isto, o nome real do contato ia direto pro
    // provedor. Diferente de ai.service.ts/sdrOutboundDraft.agent.ts (chamada única, resposta reidratada no
    // fim), aqui o texto reentra num agente multi-turn: reidratar de volta exigiria rastrear o
    // token pelo estado do grafo até onde a saída final chega no humano — não coberto ainda,
    // então o pior caso hoje é "[NOME_DO_CONTATO]" aparecer cru se a IA ecoar o token de volta
    // no resumo de qualificação, nunca o nome real vazando pro provedor externo.
    if (p) {
      context = minimizePii(context, [{ token: '[NOME_DO_CONTATO]', value: p.name }]).text;
    }

    return context;
  },
  {
    name: 'get_lead_context',
    description:
      'Obtém as informações detalhadas e dados enriquecidos de uma empresa e contato a partir do ID do Lead.',
    schema: z.object({
      leadId: z.string().describe('O ID do Lead (ex: cm0v...)'),
    }),
  },
);

/**
 * Ferramenta para o agente salvar a qualificação e o resumo no CRM
 */
export const updateLeadQualificationTool = tool(
  async ({
    leadId,
    score,
    summary,
    status,
  }: {
    leadId: string;
    score: number;
    summary: string;
    status: string;
  }) => {
    const organizationId = getTenantId();
    if (!organizationId) {
      return 'Erro ao atualizar qualificação: contexto de organização ausente.';
    }
    try {
      // updateMany (não update) porque o where precisa filtrar por organizationId além do id —
      // sem isso, o agente de um tenant conseguia sobrescrever score/status do lead de outro
      // tenant só sabendo o ID (o mesmo tipo de IDOR corrigido em get_lead_context acima).
      const { count } = await prisma.lead.updateMany({
        where: { id: leadId, organizationId },
        data: {
          score,
          status: toPrismaLeadStatus(
            status as LeadStatus,
          ) as unknown as Prisma.LeadUpdateManyMutationInput['status'],
          qualification: {
            score,
            summary,
            evaluatedAt: new Date().toISOString(),
          },
        },
      });
      if (count === 0) {
        return `Erro: Lead ${leadId} não encontrado no CRM.`;
      }
      return `Lead ${leadId} qualificado com sucesso com nota ${score}. Status atualizado para ${status}.`;
    } catch (error) {
      return `Erro ao atualizar qualificação: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: 'update_lead_qualification',
    description:
      'Salva a nota de qualificação (score), o resumo (summary) e o novo status (status) do Lead no banco de dados CRM.',
    schema: z.object({
      leadId: z.string().describe('O ID do Lead'),
      score: z.number().min(0).max(100).describe('A nota de propensão de 0 a 100'),
      summary: z.string().describe('O resumo de 1 ou 2 frases da análise da IA'),
      status: z
        .enum(['Lead_Recebido', 'Qualificacao_SDR', 'Reuniao_Agendada', 'Lead_Desqualificado'])
        .describe(
          'O novo status sugerido para o lead baseado na nota (ex: se > 70, Reuniao_Agendada; senão Qualificacao_SDR ou Lead_Desqualificado)',
        ),
    }),
  },
);
