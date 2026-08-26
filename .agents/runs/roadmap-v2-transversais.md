# Roadmap v2 — Especialistas transversais (14 Test Harness, 15 Segurança Aplicada, 17 Cadência)

- **SHA base:** `599668b2de111758faa620fc6eb64a1de2787ca6` (`origin/main`)
- **Data/hora (UTC):** 2026-08-26
- **Branch de integração:** `integracao/roadmap-v2-transversais`
- **Decisão:** disparada como próximo lote da fila (pedido do usuário: "quando for liberando agente
  já vai inserindo os próximos"). Estes três agentes não têm agrupamento de "onda" formal em
  `/AGENTS.md` (foram adicionados ao roster depois da estrutura original de Ondas 1-4) — reunidos
  aqui por conveniência de integração, não por dependência entre si. Propriedade de arquivo disjunta
  de tudo em execução nas Ondas 1, 2, 3 e 4.

## 1. Escopo (Freeze de escopo em vigor)

Mesmo regime das ondas anteriores: auditoria fail-closed com correção no próprio escopo, sem
feature nova.

## 2. Especialistas e matriz de propriedade

| Agente | Missão | Pastas/arquivos de propriedade |
|---|---|---|
| 14 — Ambiente de Execução e Test Harness | Auditar a infraestrutura de teste (não os testes de feature em si) quanto a mascaramento de falha de ambiente como sucesso, configuração de paralelismo/timeout, e setup determinístico. | `scripts/test/**`, `vitest.*.config.ts`, `playwright.config.ts` |
| 15 — Segurança Aplicada e Rotação de Segredos | Auditar os scripts de segurança aplicada (não a lógica de negócio de cada domínio, já coberta pelos outros agentes) quanto a gate fail-open disfarçado de fail-closed, e política de rotação de segredo documentada vs. real. | `scripts/security/**`, `src/lib/security/` |
| 17 — Cadência Multicanal e Ciclo de Receita | Auditar sequências de cadência (e-mail/WhatsApp/ligação) quanto a opt-out não respeitado e envio duplicado/fora de janela. | `src/features/cadence/` |

Nenhuma sobreposição com as Ondas 1-4 em execução. Nota: `src/lib/queue/` (filas/workers, incluindo
o worker de cadência se houver) é propriedade do Agente 07 (já concluído nesta onda) — 17 não edita
arquivos de fila, só a lógica de cadência em si; achado num worker é handoff.

## 3. Gate mínimo

Igual ao gate mínimo já descrito em `.agents/runs/roadmap-v2-onda-2.md`, seção 4.

## 4. Status

Onda disparada nesta data. Relatório final de integração será registrado em atualização deste
mesmo arquivo.
