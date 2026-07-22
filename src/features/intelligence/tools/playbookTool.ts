import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { vectorStore } from '../../../lib/ai/vectorStore.js';

/**
 * Ferramenta para o agente pesquisar regras e matrizes de objeção/qualificação no playbook (Vector Store)
 */
export const searchPlaybookTool = tool(
    async ({ query }: { query: string }) => {
        try {
            const results = await vectorStore.similaritySearch(query, 3);
            
            if (results.length === 0) {
                return "Nenhum trecho do playbook encontrado para esta busca.";
            }

            let responseText = "Trechos do Playbook encontrados:\n\n";
            results.forEach((r, idx) => {
                // Se a similaridade for muito baixa, não confie tanto
                if (r.similarity < 0.7) return; 
                responseText += `--- Trecho ${idx + 1} (Score: ${(r.similarity * 100).toFixed(1)}%) ---\n${r.content}\n\n`;
            });

            if (responseText === "Trechos do Playbook encontrados:\n\n") {
                 return "Foram encontrados trechos, mas a relevância era muito baixa. Tente uma busca mais genérica ou com termos diferentes.";
            }

            return responseText;
        } catch (error) {
            return `Erro ao buscar no playbook: ${error instanceof Error ? error.message : String(error)}`;
        }
    },
    {
        name: 'search_playbook',
        description: 'Pesquisa na base de conhecimento (Vector Store / Playbook Comercial da Atlas) por regras de qualificação, matrizes de objeção ou critérios de ICP. Use isso quando não souber como qualificar um tipo específico de cliente.',
        schema: z.object({
            query: z.string().describe('A pergunta ou termo de busca, ex: "Como qualificar transportadoras com baixo volume?" ou "ICP ideal da Atlas"'),
        }),
    }
);
