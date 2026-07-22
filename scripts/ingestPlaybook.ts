import { prisma } from '../src/lib/prisma.js';
import { vectorStore } from '../src/lib/ai/vectorStore.js';
import fs from 'fs';
import path from 'path';

async function ingestPlaybook() {
    console.log("Iniciando ingestão do Playbook...");

    // Simulando a leitura de um arquivo Markdown ou PDF com os playbooks.
    // Em um cenário real, você apontaria para o arquivo real em "./playbook.md".
    const playbookContent = `
# Playbook Comercial - AtlasGR

## 1. ICP (Ideal Customer Profile)
A Atlas atende principalmente transportadoras, embarcadores e operadores logísticos no Brasil.
O cliente ideal tem pelo menos 20 veículos na frota ou movimenta mais de 50 viagens por mês.
Clientes em fase de expansão operacional (abrindo novas filiais) ou sob pressão de risco (recém sofreram um grande roubo de carga) têm maior urgência.

## 2. Qualificação
- **Transportadoras pequenas (1 a 10 veículos)**: Fit baixo, geralmente não têm maturidade de processos para absorver a Torre de Controle da Atlas. Score máximo sugerido: 40.
- **Transportadoras médias (11 a 50 veículos)**: Fit médio/alto. Têm dor operacional mas podem ter orçamento restrito. Se estiverem em expansão, o fit aumenta. Score sugerido: 60 a 80.
- **Grandes operadores (51+ veículos)**: Fit altíssimo. A dor da perda de visibilidade é multiplicada pelo volume. Score sugerido: 85 a 100.

## 3. Matriz de Objeções
- **Objeção**: "Já temos rastreador."
- **Contorno**: "Rastreador mostra o ponto no mapa, mas não toma ação quando ocorre um desvio. Nossa plataforma orquestra a tratativa com a escolta e gera evidência legal para a seguradora."

- **Objeção**: "Tá muito caro."
- **Contorno**: "Qual foi o impacto financeiro do seu último sinistro? A Atlas geralmente se paga evitando 1 único roubo no trimestre."
`;

    try {
        // 1. Criar um documento pai
        const document = await prisma.document.create({
            data: {
                title: "Playbook Comercial AtlasGR - Base de Conhecimento",
                content: playbookContent,
                metadata: { version: "1.0", author: "Comercial" }
            }
        });
        
        console.log(`Documento criado com ID: ${document.id}`);

        // 2. Quebrar o conteúdo em chunks menores (simulação de chunking)
        // Em um sistema real, usaríamos o RecursiveCharacterTextSplitter do LangChain
        const chunks = playbookContent.split('\n## ').filter(c => c.trim().length > 0);

        console.log(`Dividido em ${chunks.length} partes. Gerando embeddings...`);

        // 3. Salvar cada chunk no banco e gerar o vetor no pgvector
        for (let i = 0; i < chunks.length; i++) {
            let chunkText = chunks[i];
            // Recolocar o "## " que foi retirado no split (exceto no primeiro se não tinha)
            if (!chunkText.startsWith('# ')) {
                chunkText = '## ' + chunkText;
            }

            console.log(`Ingerindo chunk ${i + 1}/${chunks.length}...`);
            await vectorStore.addDocumentChunk(document.id, chunkText);
        }

        console.log("✅ Ingestão finalizada com sucesso!");
    } catch (error) {
        console.error("❌ Erro durante a ingestão:", error);
    } finally {
        await prisma.$disconnect();
    }
}

ingestPlaybook();
