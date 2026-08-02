import { logger } from '../../../lib/logger.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getAiModel, logAiUsage } from '../../../lib/ai/gateway.js';
import { IDataProvider } from '../../../lib/adapters/data-providers/IDataProvider.js';
import { IEnrichedLead } from '../../../types/prospecting.js';
import { chromium } from '@playwright/test'; // Utilizando Playwright para Multimodal Vision

interface InferredInsights {
  description: string;
  technologies: string[];
}

/** 
 * Novo Módulo Multimodal: Visita o site da empresa em background, tira um screenshot 
 * da homepage e utiliza um modelo LLM Multimodal (Visão) para extrair inteligência oculta
 * que não está escrita explicitamente em texto (ex: UX, tipo de frota pelas fotos, etc).
 */
async function analyzeWebsiteVision(url: string): Promise<string> {
  if (!url || !url.startsWith('http')) return '';

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    const screenshotBuffer = await page.screenshot({ type: 'jpeg', quality: 50 });
    const base64Image = screenshotBuffer.toString('base64');
    
    // Invocando modelo multimodal (local-llama3-fast/local-llama3 suporta imagens via LangChain)
    const model = getAiModel('local-llama3-fast', 0.2, 'deep-research-vision');
    const startTime = Date.now();

    const response = await model.invoke([
        new SystemMessage(
            'Você é um analista de inteligência de mercado especializado no setor logístico. Analise o screenshot da homepage desta empresa e descreva em um parágrafo denso: Qual o foco aparente da empresa? O design sugere alta tecnologia ou tradição? Existem fotos de frotas específicas (caminhões pesados, vans)?'
        ),
        new HumanMessage({
            content: [
                { type: "text", text: "Analise a imagem deste site:" },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
            ]
        })
    ]);

    await logAiUsage({
      model: response.response_metadata.model,
      usage: response.response_metadata.tokenUsage,
      latencyMs: Date.now() - startTime,
    });

    return response.content as string;
  } catch (error) {
    logger.warn({ err: error, url }, 'Falha na análise multimodal (Vision) do site.');
    return '';
  } finally {
    if (browser) await browser.close();
  }
}

async function inferMissingInsights(lead: Partial<IEnrichedLead>, visionInsight: string): Promise<InferredInsights> {
  const knownFacts = [
    lead.website && `Site: ${lead.website}`,
    lead.cnaeMain && `CNAE principal: ${lead.cnaeMain}`,
    lead.products?.length && `Produtos: ${lead.products.join(', ')}`,
    visionInsight && `Análise Visual do Site: ${visionInsight}`
  ].filter(Boolean);

  if (knownFacts.length === 0) {
    return { description: '', technologies: [] };
  }

  const model = getAiModel('local-llama3-fast', 0.2, 'deep-research:infer');
  try {
    const response = await model.invoke([
      new SystemMessage(
        'Você sintetiza dados para um CRM B2B. Extraia a descrição e as tecnologias em JSON: {"description": string, "technologies": string[]}.'
      ),
      new HumanMessage(`Fatos:\n${knownFacts.join(' | ')}`),
    ]);
    const jsonText = response.content.toString().replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonText);
    return {
      description: typeof parsed.description === 'string' ? parsed.description : '',
      technologies: Array.isArray(parsed.technologies) ? parsed.technologies : [],
    };
  } catch {
    return { description: '', technologies: [] };
  }
}

export class DeepResearchService {
  private providers: IDataProvider[];

  constructor(providers: IDataProvider[]) {
    this.providers = providers;
  }

  async enrich(lead: Partial<IEnrichedLead>): Promise<IEnrichedLead> {
    let enrichedLead = { ...lead };

    // 1. Enriquecimento via Provedores Estruturados (BrasilAPI, Apollo, etc)
    for (const provider of this.providers) {
      try {
        const result = await provider.enrich(enrichedLead);
        enrichedLead = { ...enrichedLead, ...result };
      } catch (err: unknown) {
        logger.error({ err }, `[DeepResearch] Erro ao enriquecer via ${provider.providerName}:`);
      }
    }

    // 2. Multimodal Vision Analysis (Inovação Fase 2)
    let visionInsight = '';
    if (enrichedLead.website) {
        visionInsight = await analyzeWebsiteVision(enrichedLead.website);
    }

    // 3. Síntese Final Combinada
    if (!enrichedLead.description || !enrichedLead.technologies?.length || visionInsight) {
      const inferred = await inferMissingInsights(enrichedLead, visionInsight);
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
