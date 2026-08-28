/**
 * Estimativa de custo de chamadas de IA — política de precificação isolada do gateway em si:
 * atualizar preços/modelos aqui nunca deve exigir tocar em roteamento, retry ou telemetria.
 */
import type { AiTokenUsage } from './types.js';

// Preço aproximado por 1M de tokens (USD) — usado só para estimar custo no AILog e na métrica
// ai_usage_cost_usd_total (metrics.ts), não é cobrança real.
const PRICING_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  'openai/gpt-oss-20b': { input: 0.075, output: 0.3 },
  'openai/gpt-oss-120b': { input: 0.15, output: 0.6 },
  'local-llama3': { input: 0.15, output: 0.6 },
  'local-llama3-fast': { input: 0.075, output: 0.3 },
  'qwen-coder': { input: 0.2, output: 0.6 },
  'deepseek-coder': { input: 0.14, output: 0.28 },
};

export function estimateCostUsd(model: string, usage: AiTokenUsage): number {
  const pricing =
    PRICING_PER_MILLION_TOKENS[model] ?? PRICING_PER_MILLION_TOKENS['local-llama3-fast'];
  return (
    (usage.promptTokens / 1_000_000) * pricing.input +
    (usage.completionTokens / 1_000_000) * pricing.output
  );
}
