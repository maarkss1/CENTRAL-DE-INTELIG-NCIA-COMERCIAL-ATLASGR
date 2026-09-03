import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { cleanAndParseJson, getAiModel } from '../../../lib/ai/gateway.js';
import type { GoldenSemanticJudge, SemanticJudgeResult } from './goldenDataset.scoring.js';

const clamp01 = (value: unknown): number => Math.max(0, Math.min(1, Number(value) || 0));

// Achado da auditoria (PR #328, item fora de escopo original): `clamp01`/`String()` já degradavam
// com segurança campo a campo, mas isso presumia que `raw` fosse sempre um objeto — uma resposta
// que fosse JSON válido porém não-objeto (ex.: `null`, um array, um número) fazia `raw.semanticScore`
// lançar ou se comportar de forma imprevisível antes de chegar no clamp. `.catch({})` preserva
// exatamente a filosofia já documentada na classe (nunca deixar o juiz virar um PASS/crash
// silencioso) — só formaliza "shape inesperado" como um caso tratado, não uma exceção não pega.
const semanticJudgeRawSchema = z
  .object({
    semanticScore: z.unknown(),
    factualityScore: z.unknown(),
    playbookAdherenceScore: z.unknown(),
    hallucinationRisk: z.unknown(),
    rationale: z.unknown(),
  })
  .partial()
  .catch({});

/**
 * Juiz semântico opcional. O scorer determinístico continua obrigatório mesmo quando este juiz é
 * usado; o LLM nunca tem poder para transformar sozinho um output estruturalmente errado em PASS.
 */
export class GatewayGoldenSemanticJudge implements GoldenSemanticJudge {
  async judge({
    goldenCase,
    actual,
  }: Parameters<GoldenSemanticJudge['judge']>[0]): Promise<SemanticJudgeResult> {
    const model = getAiModel('local-llama3-fast', 0, 'golden-dataset-judge');
    const response = await model.invoke([
      new SystemMessage(
        'Você é um juiz de regressão de IA. Avalie SOMENTE contra o caso ouro fornecido. ' +
          'Não recompense eloquência. Dê notas de 0 a 1 para semanticScore (atende a intenção/expected), ' +
          'factualityScore (não contradiz o input), playbookAdherenceScore (segue expected/regras) ' +
          'e hallucinationRisk (1 = inventou fatos não sustentados). ' +
          'Responda apenas JSON no formato ' +
          '{"semanticScore":0,"factualityScore":0,"playbookAdherenceScore":0,"hallucinationRisk":0,"rationale":"curto"}.',
      ),
      new HumanMessage(
        JSON.stringify({
          input: goldenCase.input,
          expected: goldenCase.expected,
          actual,
        }),
      ),
    ]);

    const raw = semanticJudgeRawSchema.parse(cleanAndParseJson<unknown>(response.content));
    return {
      semanticScore: clamp01(raw.semanticScore),
      factualityScore: clamp01(raw.factualityScore),
      playbookAdherenceScore: clamp01(raw.playbookAdherenceScore),
      hallucinationRisk: clamp01(raw.hallucinationRisk),
      rationale: String(raw.rationale ?? ''),
    };
  }
}
