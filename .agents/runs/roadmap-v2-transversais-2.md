# Roadmap v2 — Especialistas transversais 2 (12 Voz/Telefonia, 13 Enxame Autônomo, 18 Contratos/API)

- **SHA base:** origin/main (após merge de Ondas 1, 2, 3, 4, Transversais 1)
- **Data/hora (UTC):** 2026-08-26
- **Branch de integração:** `integracao/roadmap-v2-transversais-2`
- **Decisão:** próximo lote da fila. 12 estava retido até agora porque sua pasta
  (`src/features/integrations/birth-voice/`) é subpasta de `src/features/integrations/`, propriedade
  do Agente 06 (Onda 1) — 06 já terminou e mesclou, então 12 pode rodar em segurança. 13 estava
  retido porque `src/features/intelligence/agents/` é subpasta de `src/features/intelligence/`,
  propriedade nominal do Agente 07 (Onda 2) — 07 já terminou e mesclou sem tocar essa subpasta.

## 1. Escopo (Freeze de escopo em vigor)

Mesmo regime das ondas anteriores: auditoria fail-closed com correção no próprio escopo, sem
feature nova.

## 2. Especialistas e matriz de propriedade

| Agente | Missão | Pastas/arquivos de propriedade |
|---|---|---|
| 12 — Voz e Telefonia (Birthub Voices/3CX) | Auditar integração de voz quanto a comando/gatilho que afirma executar ação sem executar de verdade (bloqueador #7), e opt-out de contato por voz. | `src/features/integrations/birth-voice/`, `src/features/integrations/threecx/`, `src/hooks/use3CXIntegration.ts` |
| 13 — Enxame Autônomo e Governança de Agentes de Runtime | Auditar os agentes de IA que o CLIENTE usa (Supervisor/SDR/BDR/Closer/Ops), não os agentes de desenvolvimento — scheduler 24/7, `AIPendingAction`, guardrails de PII. | `src/features/intelligence/agents/` (subpasta específica, carve-out da propriedade geral de `src/features/intelligence/` do Agente 07, já concluído) |
| 18 — Contratos, API e Documentação Viva | Auditar paridade entre `docs/openapi.yaml` e as rotas reais; achado de tipo divergente em código vira handoff, não edição direta (arquivos de tipo pertencem a outros donos). | `docs/openapi.yaml`, `scripts/verify-openapi-drift.ts` |

Nenhuma sobreposição entre si nem com as ondas já concluídas.

## 3. Gate mínimo

Igual ao gate mínimo já descrito em `.agents/runs/roadmap-v2-onda-2.md`, seção 4.

## 4. Nota sobre Agente 16 (Runtime, Workers e Escala)

Não disparado nesta rodada. O roster descreve seu domínio como "filas BullMQ, cron, agendadores,
ciclo de vida do processo", mas `src/lib/queue/AGENTS.md` já atribui `src/lib/queue/` ao Agente 07
(concluído). O que sobraria para 16 (`src/bootstrap/workers.ts`, `src/bootstrap/shutdown.ts`) é
infraestrutura compartilhada de boot do processo, sem dono explícito e referenciada por múltiplos
domínios — retido até uma decisão humana ou do Coordenador sobre escopo exato, para não arriscar
colisão com o bootstrap compartilhado.

## 5. Status

Onda disparada nesta data. Relatório final de integração será registrado em atualização deste
mesmo arquivo.
