import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { vectorStore } from '../../../lib/ai/vectorStore.js';

/** Abaixo disso, um trecho encontrado só por similaridade semântica não é confiável o bastante para citar. */
const MIN_SEMANTIC_SIMILARITY = 0.7;

/**
 * Ferramenta para o agente pesquisar regras e matrizes de objeção/qualificação no playbook (Base de
 * Conhecimento / RAG).
 *
 * Proveniência ponta a ponta (Onda 7): todo trecho devolvido cita o documento de origem (título +
 * posição do trecho) — nunca apresenta o texto como se fosse conhecimento do próprio modelo, e nunca
 * afirma ter encontrado algo que não existe. `vectorStore.similaritySearch` delega para o mesmo motor
 * de busca híbrida (semântico + palavra-chave) da Base de Conhecimento real (ver RAG-001 em
 * `src/lib/ai/vectorStore.ts`).
 */
export const searchPlaybookTool = tool(
    async ({ query }: { query: string }) => {
        try {
            const results = await vectorStore.similaritySearch(query, 5);

            if (results.length === 0) {
                return 'Nenhum trecho do playbook encontrado para esta busca. Não invente uma resposta baseada em conhecimento geral — informe que a Base de Conhecimento não tem esse conteúdo.';
            }

            // Um hit sem embedding (só bateu por palavra-chave) não tem `similarity` — o limiar
            // semântico não se aplica a ele. Um hit semântico abaixo do limiar é descartado: citar a
            // fonte errada é pior do que dizer "não encontrei".
            const usable = results.filter((r) => r.similarity == null || r.similarity >= MIN_SEMANTIC_SIMILARITY);

            if (usable.length === 0) {
                return 'Foram encontrados trechos, mas a relevância era muito baixa para citar com segurança. Tente uma busca mais específica ou com termos diferentes.';
            }

            const lines = usable.map((r, idx) => {
                const scoreLabel = r.similarity != null
                    ? `similaridade ${(r.similarity * 100).toFixed(1)}%`
                    : 'correspondência por palavra-chave';
                return [
                    `--- Trecho ${idx + 1} — Fonte: "${r.documentTitle}" (trecho ${r.chunkIndex + 1}, ${scoreLabel}) ---`,
                    r.content,
                ].join('\n');
            });

            return `Trechos do Playbook encontrados (cite sempre a fonte entre aspas ao usar o conteúdo abaixo):\n\n${lines.join('\n\n')}`;
        } catch (error) {
            return `Erro ao buscar no playbook: ${error instanceof Error ? error.message : String(error)}`;
        }
    },
    {
        name: 'search_playbook',
        description: 'Pesquisa na base de conhecimento (Base de Conhecimento / Playbook Comercial da Atlas) por regras de qualificação, matrizes de objeção ou critérios de ICP. Use isso quando não souber como qualificar um tipo específico de cliente. Cada resultado cita o documento de origem — sempre mencione essa fonte ao usar o conteúdo na resposta final.',
        schema: z.object({
            query: z.string().describe('A pergunta ou termo de busca, ex: "Como qualificar transportadoras com baixo volume?" ou "ICP ideal da Atlas"'),
        }),
    }
);
