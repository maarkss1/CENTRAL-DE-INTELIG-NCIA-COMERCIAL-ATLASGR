import { Chroma } from "@langchain/community/vectorstores/chroma";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";
import { PrismaClient } from "@prisma/client";
import | logger } from "../../src/lib/logger.js";

const prisma = new PrismaClient();

export class ChromaDBRagEngine {
  private vectorStore: Chroma | null = null;
  private embeddings: OpenAIEmbeddings;

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      modelName: "text-embedding-3-small",
    });
  }

  async initStore() {
    this.vectorStore = new Chroma(this.embeddings, {
      collectionName: "leads_prospects_collection",
      url: process.env.CHROMA_URL || "http://localhost:8000",
    });
    logger.info("ChromaDB vector store initialized");
  }

  async indexLeadsAndProspects() {
    if (!this.vectorStore) await this.initStore();
    
    logger.info("Fetching Leads and Prospects for indexing...");
    
    const leads = await prisma.lead.findMany({
      take: 1000,
      include: {
        company: true,
        contact: true,
      },
    });
    
    const prospects = await prisma.prospect.findMany({
      take: 1000,
    });
    
    const docs: Document[] = [];

    for (const lead of leads) {
      const content = `Lead ID: ${lead.id}\nStatus: ${lead.status}\nSource: ${lead.source || 'N/A'}\nCompany: ${lead.company?.legalName || 'N/A'}\nContact: ${lead.contact?.name || 'N/A'}\nQualification: ${JSON.stringify(lead.qualification || {})}`;
      
      docs.push(new Document({
        pageContent: content,
        metadata: {
          id: lead.id,
          type: "lead",
          organizationId: lead.organizationId || "",
        }
      }));
    }

    for (const prospect of prospects) {
      const content = `Prospect ID: ${prospect.id}\nCompany: ${prospect.companyName || 'N/A'}\nCNPJ: ${prospect.cnpj || 'N/A'}\nIntelligence: ${JSON.stringify(prospect.intelligence || {})}`;
      
      docs.push(new Document({
        pageContent: content,
        metadata: {
          id: prospect.id,
          type: "prospect",
          organizationId: prospect.organizationId || "",
        }
      }));
    }

    if (docs.length > 0) {
      logger.info(`Adding ${docs.length} documents to ChromaDB...`);
      await this.vectorStore!.addDocuments(docs);
      logger.info("Indexing complete.");
    } else {
      logger.info("No documents to index.");
    }
  }

  async searchSemantic(query: string, filter?: any, k: number = 5) {
    if (!this.vectorStore) await this.initStore();
    
    const results = await this.vectorStore!.similaritySearch(query, k, filter);
    return results;
  }
}
