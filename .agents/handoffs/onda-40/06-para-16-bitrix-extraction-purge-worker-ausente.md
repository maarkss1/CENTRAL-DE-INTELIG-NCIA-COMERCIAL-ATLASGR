- De: Agente 06 (Integrações e Bitrix)
- Para: Agente 16 (Runtime, Workers e Escala) — com cópia de contexto para 06A (Extrações Bitrix) e 01A (Confiabilidade de Dados, RLS e Retenção)
- Onda: 40
- Status: aberto
- Prioridade: normal

## Problema

Auditoria pediu para investigar por que o expurgo LGPD do histórico de Extrações Bitrix
(`BitrixExtractionRun`) está desligado por padrão (`BITRIX_EXTRACTION_PURGE_ENABLED=false` em
`src/config/env.ts`) e avaliar se dá para ativar com segurança.

**Achado real: não é uma flag de segurança conservadora bloqueando um worker que já existe e
funciona — o worker de expurgo em si nunca foi implementado.** `BITRIX_EXTRACTION_PURGE_ENABLED` e
`BITRIX_EXTRACTION_RETENTION_DAYS` são parâmetros que já existem no schema de configuração desde a
Onda 6 (ver `.agents/handoffs/onda-6/01A-para-06-bitrix-extraction-run-schema.md`), preparados de
propósito para quando o worker fosse construído — mas nenhum consumidor lê
`BITRIX_EXTRACTION_PURGE_ENABLED` hoje. Busquei por `purge`/`Purge`/`expurgo`/`bitrixExtractionPurge`
em todo `src/` e não existe nenhum arquivo de worker de expurgo, nem em
`src/lib/queue/` (que hoje tem `bitrixSync.worker.ts`, `enrichmentCascade.worker.ts`,
`swarmScheduler.worker.ts`, etc., mas nenhum `bitrixExtractionPurge.worker.ts` ou equivalente), nem
referenciado em `worker.ts`.

Isso já estava documentado como pendência conhecida — o próprio código-fonte confirma:
- `src/features/integrations/bitrix/service/extraction.ts:26-27`: "...retenção via
  `BITRIX_EXTRACTION_RETENTION_DAYS` (worker de expurgo continua DESLIGADO por padrão, fora do
  escopo desta rodada)."
- `src/config/env.ts:159-166` (comentário acima da declaração das duas env vars): "...o worker de
  expurgo correspondente fica DESLIGADO por padrão (mesmo padrão de dois-fatores do SDR/enxame
  acima: a flag sozinha não move nada sem esta variável, e o valor de dias sozinho não expurga nada
  sem a flag)."
- `.agents/handoffs/onda-6/01A-para-06-bitrix-extraction-run-schema.md`, seção "Resolução (Sprint
  00/Onda 12 — GOV-006)": "O módulo real de extração (serviço/worker/UI) segue não implementado —
  isso é escopo de feature nova, não deste handoff de schema, e fica registrado como item de
  backlog pós-freeze (GOV-003), não como bloqueador."

Ou seja: não há decisão de segurança para reverter — há uma feature inteira ainda não construída.
Ativar `BITRIX_EXTRACTION_PURGE_ENABLED=true` hoje não teria efeito nenhum (nada lê essa flag), então
"ativar" não é tecnicamente arriscado neste exato instante — mas também não resolve o gap de LGPD: o
histórico de extrações continua sem expurgo automático até o worker existir. Por isso NÃO ativei a
flag por conta própria: fazer isso sem o worker existir passaria a falsa impressão de que o expurgo
está "ligado" quando na prática nada é apagado, e construir o worker de verdade esbarra em decisões
que exigem confirmação humana (ver abaixo) e em arquivos fora da minha propriedade nesta rodada
(`src/features/integrations/bitrix/**` apenas).

## Arquivo(s) envolvido(s)
- `src/config/env.ts` — declaração de `BITRIX_EXTRACTION_RETENTION_DAYS` (default 45) e
  `BITRIX_EXTRACTION_PURGE_ENABLED` (default `false`). Não editado por mim (fora do meu escopo
  nesta rodada).
- `src/features/integrations/bitrix/service/extraction.ts` — dono do `BitrixExtractionRun` e de
  `deleteExtractionRunFiles` (`extractionFiles.ts`), que já existe e remove os arquivos gerados de
  UMA execução (usado hoje só pelo cancelamento manual). O worker de expurgo automático precisaria
  reaproveitar essa função por linha expirada, não reimplementar a remoção de arquivo.
- `src/lib/queue/*.worker.ts` — nenhum arquivo de expurgo existe aqui ainda; é onde o novo worker
  deveria morar, seguindo o padrão de `bitrixSync.worker.ts`/`swarmScheduler.worker.ts` (cron via
  BullMQ, não fire-and-forget dentro do request HTTP).
- `worker.ts` (raiz) — registro do novo worker precisa entrar aqui. Fora da minha propriedade
  (compartilhado, ver `AGENTS.md`).

## Alteração necessária
Construir `bitrixExtractionPurge.worker.ts` (ou nome equivalente) em `src/lib/queue/`, registrado
em `worker.ts`, que:
1. Só executa quando `BITRIX_EXTRACTION_PURGE_ENABLED === true` (env já existe, só falta o
   consumidor).
2. Seleciona `BitrixExtractionRun` com `createdAt` mais antigo que
   `BITRIX_EXTRACTION_RETENTION_DAYS` dias (env já existe).
3. Para cada linha expirada: remove os arquivos associados via `deleteExtractionRunFiles` (já
   existe em `extractionFiles.ts`) ANTES de remover a linha do Postgres — nunca a linha sozinha,
   para não deixar arquivo órfão em disco.
4. É idempotente (rodar duas vezes seguidas no mesmo lote não deve falhar nem duplicar efeito —
   trivial aqui já que DELETE de uma linha já deletada é no-op) e reversível SÓ até o momento em que
   roda (é expurgo real — depois de rodar, o dado não volta; por isso a decisão de LIGAR em
   produção não é minha para tomar sozinho, mesmo com o worker pronto).
5. Roda em RLS bypass (mesmo padrão de outros workers em `src/lib/queue/`), já que processa todas
   as organizações, não uma sessão de usuário.

## Decisão humana pendente antes de LIGAR em produção (mesmo depois do worker existir)
- Confirmar se DELETE físico da linha é o comportamento desejado, ou se deveria ser soft-delete
  (a auditoria/LGPD às vezes prefere anonimizar em vez de apagar, dependendo da base legal
  registrada) — este módulo já tem um precedente de "anonimizar" em vez de apagar
  (`autoAnonymizeDisqualified.worker.ts`), então vale confirmar qual dos dois padrões se aplica
  aqui antes de escolher.
- Confirmar que 45 dias (já confirmado para a JANELA, não para o LIGAR o worker) continua válido
  quando o worker for de fato construído — a confirmação de 2026-08-15 fixou o número, não a
  decisão de ativar o expurgo automático em si.
- Rodar o worker primeiro em modo dry-run (log do que seria apagado, sem apagar) num ambiente não-
  produção antes de qualquer ativação real, dado que é uma operação sem reversibilidade.

## Teste esperado
- Idempotência (rodar duas vezes seguidas no mesmo lote não duplica efeito nem lança erro).
- Respeito ao flag desligado por padrão (não expurga nada quando `BITRIX_EXTRACTION_PURGE_ENABLED`
  não está explicitamente `true`).
- Remove arquivo E linha juntos (nunca um sem o outro).
- Isolamento entre organizações (RLS/filtro explícito, mesmo padrão de `tenant-isolation-*.test.ts`).

## Contexto adicional
Investigação feita nesta rodada (Onda de auditoria Bitrix, gap LGPD):
```
grep -rln "BITRIX_EXTRACTION_PURGE_ENABLED\|purgeExpiredExtractionRuns\|purgeExtraction" src --include="*.ts"
# → só src/config/env.ts (a declaração da env var em si, nenhum consumidor)
```
Nenhuma alteração de código foi feita para este item — meu escopo nesta rodada
(`src/features/integrations/bitrix/**`) não inclui `worker.ts` nem justificaria eu construir um
worker novo sem a confirmação humana acima, então documentei e registrei este handoff em vez de
ativar a flag ou implementar o worker sozinho.
