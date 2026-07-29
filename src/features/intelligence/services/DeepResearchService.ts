import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { IDataProvider } from '../../../lib/adapters/data-providers/IDataProvider';
import { IEnrichedLead } from '../../../types/prospecting';
import { getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';

interface InferredInsights {
  description: string;
  technologies: string[];
}

/** Quando as fontes de dados estruturadas não trazem descrição/tecnologias, pedimos pra IA inferir
 * a partir do que já foi coletado (site, CNAE, produtos/serviços) — nunca inventando fatos novos,
 * só sintetizando o que já está nos dados. Falha silenciosamente (retorna vazio) se a IA não puder
 * ajudar, para nunca travar o enriquecimento por causa de uma chamada opcional. */
async function inferMissingInsights(lead: Partial<IEnrichedLead>): Promise<InferredInsights> {
  const knownFacts = [
    lead.website && `Site: ${lead.website}`,
    lead.cnaeMain && `CNAE principal: ${lead.cnaeMain}`,
    lead.cnaesSecondary?.length && `CNAEs secundários: ${lead.cnaesSecondary.join(', ')}`,
    lead.products?.length && `Produtos: ${lead.products.join(', ')}`,
    lead.services?.length && `Serviços: ${lead.services.join(', ')}`,
  ].filter(Boolean);

  if (knownFacts.length === 0) {
    return { description: '', technologies: [] };
  }

  const model = getAiModel('gemini-flash', 0.2, 'deep-research:infer');
  const startTime = Date.now();
  try {
    const response = await model.invoke([
      new SystemMessage(
        'Você sintetiza dados públicos de empresas de logística/transporte para um CRM comercial B2B. Baseie-se ESTRITAMENTE nos fatos fornecidos — nunca invente tecnologias, números ou serviços que não estejam implícitos neles. Se não houver base suficiente para um campo, deixe-o vazio. Responda SOMENTE com JSON válido, sem markdown, no formato exato: {"description": string (1-2 frases, ou ""), "technologies": string[] (nomes de tecnologias/sistemas prováveis dado o setor, ou [])}.',
      ),
      new HumanMessage(`Fatos conhecidos sobre a empresa:\n${knownFacts.join(' | ')}`),
    ]);
    await logAiUsage({
      model: response.response_metadata.model,
      usage: response.response_metadata.tokenUsage,
      latencyMs: Date.now() - startTime,
    });
    const jsonText = response.content.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonText);
    return {
      description: typeof parsed.description === 'string' ? parsed.description : '',
      technologies: Array.isArray(parsed.technologies) ? parsed.technologies : [],
    };
  } catch (err) {
    console.error('[DeepResearch] Falha ao inferir insights via IA:', err);
    return { description: '', technologies: [] };
  }
}

export class DeepResearchService {
  private providers: IDataProvider[];

  constructor(providers: IDataProvider[]) {
    this.providers = providers;
  }

  /**
   * Realiza um enriquecimento profundo (Deep Research) usando todas as fontes configuradas.
   */
  async enrich(lead: Partial<IEnrichedLead>): Promise<IEnrichedLead> {
    let enrichedLead = { ...lead };

    for (const provider of this.providers) {
      try {
        const result = await provider.enrich(enrichedLead);

        enrichedLead = {
          ...enrichedLead,
          ...result,
          sources: [...(enrichedLead.sources || []), ...((result as any).enrichment?.sources || [])]
        };
      } catch (err) {
        console.error(`[DeepResearch] Erro ao enriquecer via ${provider.providerName}:`, err);
      }
    }

    // Regra: Sempre tentar enriquecer os dados e nunca retornar dados parcialmente preenchidos sem tratamento.
    // Quando as fontes estruturadas não trouxeram descrição/tecnologias, tentamos inferir via IA a partir
    // do que já foi coletado, sem inventar fatos novos.
    if (!enrichedLead.description || !enrichedLead.technologies?.length) {
      const inferred = await inferMissingInsights(enrichedLead);
      if (!enrichedLead.description && inferred.description) {
        enrichedLead.description = inferred.description;
      }
      if (!enrichedLead.technologies?.length && inferred.technologies.length > 0) {
        enrichedLead.technologies = inferred.technologies;
      }
    }

    enrichedLead.status = 'READY';
    return enrichedLead as IEnrichedLead;
  }
}
