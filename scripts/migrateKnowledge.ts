import { prisma } from '../src/lib/prisma.js';

async function main() {
  console.log('Migrando KnowledgeChunk para Document e DocumentChunk...');
  
  try {
    // Como o modelo foi removido do schema Prisma, usamos raw query
    const chunks = await prisma.$queryRaw`SELECT * FROM "KnowledgeChunk"`;
    
    for (const chunk of chunks as any[]) {
      // Cria um documento pai
      const doc = await prisma.document.create({
        data: {
          organizationId: chunk.organizationId,
          title: 'Documento Legado ' + chunk.id,
          content: chunk.content,
          metadata: chunk.metadata || {},
        }
      });

      // Cria o chunk filho
      await prisma.documentChunk.create({
        data: {
          documentId: doc.id,
          content: chunk.content,
          embedding: chunk.embedding,
          metadata: chunk.metadata || {},
        }
      });
    }
    
    console.log('Migração concluída com sucesso!');
  } catch (err: any) {
    if (err.message && err.message.includes('relation "KnowledgeChunk" does not exist')) {
        console.log('Tabela KnowledgeChunk já não existe ou está vazia.');
    } else {
        throw err;
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
