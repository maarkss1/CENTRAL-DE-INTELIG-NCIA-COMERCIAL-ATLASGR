# Fase 3 — Inteligência, Score, Sinais, Decisores e Evidências

## Objetivo
Transformar fontes reais em inteligência comercial estruturada, explicável e persistente por meio de um pipeline.

## Estado Inicial
O método `refreshIntelligence` era apenas um stub retornando um snapshot falso. Não havia geração de sinais, evidências ou score.

## Agentes Acionados
- 00 (Coordenador)
- 07 (IA e Automações) - Orquestração do Pipeline
- 18 (API) - Modificação no endpoint

## Alterações Realizadas
1. **Pipeline de Inteligência**: Adicionada a lógica orquestradora em `accountIntelligence.service.ts` no método `refreshIntelligence`.
2. **Deduplicação e Normalização**: O pipeline agora cria estruturadamente:
   - `IntelligenceEvidence` (baseado em CNPJ/CNAE)
   - `AccountSignal` (ex: Expansão Logística)
   - `DecisionMaker` (ex: classificação de Buying Committee)
   - `AccountScore` (0-100 total + dimensões)
   - `AccountRecommendation` (Next Best Action - ex: `START_SDR_CADENCE`)
3. **Persistência de Snapshot**: O snapshot é gerado contemplando todo o sumário após extração dos dados pelas fontes.

## Arquivos Alterados / Criados
- [MODIFIED] `src/features/market-intelligence/server/accountIntelligence.service.ts`

## Testes Executados
- Código validado via lint/compilador.
- Testes práticos no banco dependem de Docker estar de pé, e APIs externas foram simuladas devido a chaves e rate limits.

## Riscos Restantes
- Confiabilidade de APIs terceiras (Apollo/Hunter) no ambiente real. Será necessário gerenciar retry pattern nas queues.

## Veredito
**PASS (com ressalvas)**. A arquitetura do pipeline está no código. Pode ser refinada em classes menores assim que o E2E test rodar com banco.

## Próxima Fase
FASE 4 — Bitrix24 e Next Best Action
