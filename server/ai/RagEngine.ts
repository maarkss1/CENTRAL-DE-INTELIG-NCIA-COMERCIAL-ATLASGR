import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';

export class RagEngine {
  private llm: ChatOpenAI;

  constructor() {
    this.llm = new ChatOpenAI({
      modelName: 'gpt-4o-mini', // Faster and cheaper for basic tasks
      temperature: 0,
    });
  }

  /**
   * Simple QA using context, without relying on vector DB yet.
   */
  async answerWithContext(question: string, context: string): Promise<string> {
    const promptTemplate = PromptTemplate.fromTemplate(`
      You are an expert AI assistant. Answer the question based ONLY on the provided context.
      If the context doesn't contain the answer, say "I cannot answer this based on the provided context."

      Context: {context}
      
      Question: {question}
      Answer:
    `);

    const chain = RunnableSequence.from([
      promptTemplate,
      this.llm,
      new StringOutputParser(),
    ]);

    const result = await chain.invoke({
      context,
      question,
    });

    return result;
  }
}
