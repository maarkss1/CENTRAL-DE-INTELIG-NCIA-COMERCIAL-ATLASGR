# Opt-out unificado (e-mail/WhatsApp/voz) — fechamento do bloqueador onda-7

- Data: 2026-08-15
- Branch: `integracao/optout-unificado`, criada a partir de `main` (commit `bdbfed6f`, pós Onda 8)
- Executor: Coordenador (00), via Agent tool com isolamento de worktree
- Autorização: usuário pediu explicitamente a resolução do handoff
  `.agents/handoffs/onda-7/17-para-05-06-12-contrato-optout.md` (bloqueador)

## Contexto

O Agente 17 (Onda 7) implementou a lógica de domínio pura de opt-out unificado
(`src/features/cadence/domain/optOut.ts`, `application/optOutService.ts`) mas deixou dois passos
pendentes, ambos fora do escopo de agentes que não estavam rodando nesta rodada: o schema Prisma
(`prisma/schema.prisma` é exclusivo do Agente 01/01A) e a ligação real nos 3 canais de disparo
(`src/features/prospecting/**` = 05, `src/features/integrations/whatsapp/**` = 06,
`src/features/integrations/birth-voice/**`+`threecx/**` = 12).

## O que o Coordenador fez diretamente (exceção de propriedade justificada)

`prisma/schema.prisma` e a migração são exclusivos do Agente 01/01A, ocupado na correção crítica de
RLS (Onda 9) em outra sessão ativa no repositório. Adicionado, em escopo mínimo (só o item 1 dos 5
da proposta original do Agente 17 — os outros 4, cadência multicanal/reply tracking/agendamento/
proposta-assinatura, ficam para quem assumir o resto do handoff de schema):
- `model OptOutRecord` + `enum OptOutScope`, migration `20260815120000_opt_out_record` (com
  backfill dos bloqueios de voz já existentes em `CallSuppression`, sem alterar/remover a tabela
  original — decisão de migrar a leitura continua sendo do Agente 12).
- `src/features/cadence/infra/PrismaOptOutRepository.ts` — adaptador real da porta
  `OptOutRepository` já testada em memória pelo Agente 17. Compartilhado entre os 3 canais para
  evitar 3 agentes escrevendo o mesmo arquivo em paralelo (`src/features/cadence/**` é propriedade
  exclusiva do 17).
- `tests/integration/optout-record-persistence.test.ts` — prova, contra Postgres real, que o
  adaptador casa/isola exatamente como a implementação em memória.

Tudo validado (tsc/lint/build/test:integration) antes de commitar, num worktree isolado, sem tocar
o diretório principal (outra sessão ativa).

## Especialistas executados

Três, em paralelo, cada um em worktree isolado a partir de `integracao/optout-unificado`:

| Agente | Branch | Canal |
|---|---|---|
| 05 | `agente/05-optout-cold-email` | E-mail (`cold-email.service.ts`) |
| 06 | `agente/06-optout-whatsapp` | WhatsApp (`whatsapp.service.ts`) |
| 12 | `agente/12-optout-voz` | Voz (`callSuppression.service.ts` + convivência com `CallSuppression`) |

Os 3 detectaram de forma independente que seus worktrees originais não tinham o schema/adaptador
ainda (criados pelo Coordenador depois de os 3 já estarem em andamento) e se auto-corrigiram
trazendo `integracao/optout-unificado` antes de implementar — nenhum reinventou a persistência.

O Agente 06 também trouxe (cherry-pick isolado, 1 commit, sem diff não relacionado) a correção
crítica de RLS da Onda 9 (`914d68c9`, "corrigir perda de contexto de tenant em
`requestContext.run()` com `PrismaPromise` lazy") — sem ela, a checagem de opt-out feita fora de uma
request HTTP (workers/webhooks) podia perder o tenant e falhar aberto (não bloquear quando devia).
Essa correção acabou entrando nesta branch como efeito colateral do merge.

## Merge

Sem conflito de código — só o próprio corpo do handoff (`17-para-05-06-12-contrato-optout.md`), que
os 3 agentes escreveram `## Resolução` simultaneamente; resolvido preservando as 3 seções mais uma
nota final do Coordenador. `.agents/handoffs/onda-7/17-para-05-06-12-contrato-optout.md` fechado
como `Status: resolvido`.

## Gate final (branch de integração, os 3 agentes mesclados)

| Check | Resultado |
|---|---|
| `npx tsc --noEmit` | limpo |
| `npm run lint` | 0 erros, 73 warnings (mesmo débito pré-existente) |
| `npm run build` | ok |
| `npm run test:unit` | 1086/1086 (143 arquivos) |
| `npm run test:integration` | 113/113 (24 arquivos) — inclui os 3 testes de integração cross-channel novos (`cold-email-optout`, `whatsapp-optout-gating`, `voice-optout-cross-channel`) e o `optout-record-persistence` do Coordenador |

Nenhuma falha, nenhum skip inesperado. Varredura manual de segredo — nenhum achado.

## Débito consciente, registrado, não bloqueador
- `CallSuppression` continua escrito em paralelo a `OptOutRecord` (decisão do 12 — migrar a leitura
  de voz para depender só do registro unificado é passo 3 da proposta original, exige confirmar
  100% de cobertura antes).
- Envio manual de WhatsApp pelo vendedor no painel (`skipOptOutCheck`) não passa pela checagem, por
  desenho — o contrato cobre disparo automatizado, não conversa humana ativa.
- Os outros 4 itens da proposta de schema do Agente 17 (cadência multicanal, reply tracking,
  agendamento, proposta/assinatura/fechamento) continuam pendentes — só o opt-out (item 1, o que
  bloqueava) foi aplicado.

## Decisão

**Handoff bloqueador fechado.** Pronta para revisão e merge em `main`, mediante aprovação explícita
do usuário.
