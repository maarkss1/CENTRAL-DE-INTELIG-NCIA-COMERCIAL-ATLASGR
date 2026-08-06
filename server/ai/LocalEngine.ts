import { pipeline, env } from '@xenova/transformers';

// Optimization for Node.js
env.allowLocalModels = true;

type SentimentPipeline = Awaited<ReturnType<typeof pipeline<'sentiment-analysis'>>>;
type ClassificationPipeline = Awaited<ReturnType<typeof pipeline<'zero-shot-classification'>>>;

class LocalAIEngine {
  private static sentimentPipeline: SentimentPipeline | null = null;
  private static classificationPipeline: ClassificationPipeline | null = null;

  /**
   * Initializes the models. Call this on server start to avoid cold starts.
   */
  static async warmup() {
    try {
      console.log('🤖 Warming up Local AI Engine...');
      // Load sentiment analysis (very lightweight)
      this.sentimentPipeline = await pipeline('sentiment-analysis', 'Xenova/distilbert-base-uncased-finetuned-sst-2-english');
      // Zero-shot classification
      this.classificationPipeline = await pipeline('zero-shot-classification', 'Xenova/mobilebert-uncased-mnli');
      console.log('✅ Local AI Engine ready');
    } catch (err) {
      console.error('❌ Failed to load Local AI Engine', err);
    }
  }

  /**
   * Analyzes sentiment locally without hitting any paid APIs.
   */
  static async analyzeSentiment(text: string) {
    if (!this.sentimentPipeline) await this.warmup();
    const result = await this.sentimentPipeline(text);
    return result[0]; // { label: 'POSITIVE' | 'NEGATIVE', score: number }
  }

  /**
   * Classifies text into provided categories locally.
   */
  static async classify(text: string, candidateLabels: string[]) {
    if (!this.classificationPipeline) await this.warmup();
    const result = await this.classificationPipeline(text, candidateLabels);
    return result; 
  }
}

export default LocalAIEngine;
