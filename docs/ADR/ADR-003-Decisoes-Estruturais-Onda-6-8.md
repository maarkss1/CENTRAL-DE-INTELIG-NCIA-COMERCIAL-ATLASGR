# ADR 003: Decisões Estruturais das Ondas 6–8

## Status
Aceito

- Data de registro: 2026-08-15
- Registrado por: Agente 18 (Contratos, API e Documentação Viva), Onda 8
- Este ADR documenta três decisões estruturais já tomadas e já parcialmente implementadas nas
  Ondas 6, 7 e 8 — ele não propõe nada novo, formaliza o que o código e `/AGENTS.md` já mostram.

## Contexto

Três decisões estruturais foram tomadas ao longo das Ondas 6–8 sem que nenhuma delas tivesse um
ADR próprio, apesar de todas alterarem premissas de arquitetura, processo de execução de agentes,
ou modelo de dados que outros agentes/decisões futuras precisam conhecer:

1. Onde os workers de fila (BullMQ) e o cron de negócio rodam em relação ao processo HTTP.
2. Quantos agentes de desenvolvimento podem executar em paralelo sobre este repositório, e sob
   quais condições.
3. Como a plataforma vai impedir contato comercial repetido com quem já pediu para não ser mais
   contatado, através de canais diferentes (e-mail/WhatsApp/voz).

## Decisão

### A. Separação de runtime de workers (Onda 6)

Os 13 workers BullMQ + 1 cron de negócio que hoje rodam dentro do mesmo processo `server.ts`
(HTTP + SSE + sessões Baileys em memória) serão executados por um processo Node **separado**,
`worker.ts` (raiz do repositório), que não sobe HTTP de negócio — só um health server mínimo
(`/health/live`, `/health/ready` em `WORKER_HEALTH_PORT`, padrão 3006) e graceful shutdown próprio
(drena por até 25s em SIGTERM/SIGINT).

`render.yaml` já reserva um segundo serviço (`prospector-atlas-worker`, `type: worker`, usando
`build:worker`/`start:worker`) para este processo, mas **comentado — não criado de fato**. A
migração está desenhada e codificada, mas **não está em produção**: cortar os workers de
`server.ts` antes do serviço `worker.ts` estar de fato implantado pararia silenciosamente todo o
processamento de fila (enriquecimento, sync Bitrix, discagem fria, enxame, follow-up, dedup, PDF
semanal, anonimização automática LGPD). Por isso o handoff que contém o diff completo dessa
remoção (`.agents/handoffs/onda-6/16-para-00-remover-workers-de-server-ts.md`) foi revisado e
**deliberadamente não aplicado** ainda pelo Coordenador — depende de (1) o serviço de worker
existir de verdade no Render antes do corte, e (2) autorização do usuário para o custo de um
segundo serviço pago (workers não têm tier gratuito no Render).

**Decisão**: manter os dois processos coexistindo (workers ainda dentro de `server.ts`, `worker.ts`
pronto e testado como processo standalone) até que o serviço de produção do worker seja
efetivamente provisionado — só então o handoff de remoção é aplicado, nessa ordem, nunca ao
contrário.

### B. Regra de concorrência ampliada de agentes (Onda 8)

`/AGENTS.md` → "Regra de concorrência" eleva o teto de especialistas simultâneos de **3** para
**8** (Coordenador ocupa 1 slot à parte). A auditoria de `.agents/runs/onda-1.md` a `onda-5.md`
mostrou que nenhuma falha real de execução foi causada pela quantidade de agentes em paralelo: o
único conflito de merge de toda a história foi sobreposição de propriedade entre dois agentes (teria
ocorrido com 2 agentes, não é efeito de escala), o incidente mais caro foi uma corrida de
isolamento (checkout compartilhado) e não de contagem, e a primeira falha da Onda 1 foi limite de
sessão da conta, não disputa entre agentes. O fator que de fato escala mal é o número de merges
acumulados sem gate.

**Decisão**: subir o teto para 8, condicionado a **todas** as seguintes condições (qualquer uma que
falhe reduz N): isolamento real por `git worktree`+branch própria; propriedade de arquivo disjunta
publicada antes do disparo da onda; gate de integração a cada 2–3 merges (nunca acumulado para o
fim); nenhum par de agentes ativos com handoff `bloqueador` mútuo em aberto; dono único para
arquivos compartilhados (`server.ts`, `package.json`/lockfile, `prisma/schema.prisma`); capacidade
real do ambiente de execução para sustentar N worktrees.

### C. Opt-out unificado multicanal (Onda 7)

A plataforma terá um único registro de opt-out cobrindo os três canais de contato ativo
(e-mail/WhatsApp/voz), em vez de um registro por canal como hoje.

**Estado real, para não repetir o erro que este próprio ADR existe para corrigir** (declarar
concluído o que não está): a camada de domínio/aplicação já existe e está testada —
`src/features/cadence/domain/optOut.ts` e `application/optOutService.ts` (Onda 7, Agente 17) —
com escopo `global` ou por canal, casamento de titular por `leadId`/`email`/`phoneE164` (qualquer
um bate = bloqueia), e as operações `recordOptOut`/`isOptedOut`/`assertNotOptedOut`. **O que falta**:
não existe adaptador Prisma real (só um repositório em memória usado nos testes — depende de uma
tabela `OptOutRecord` ainda não migrada, proposta em
`.agents/handoffs/onda-7/17-para-01-schema-cadencia-optout-proposta.md`), e **nenhum dos três
canais chama essa camada ainda**: hoje voz usa `CallSuppression` (por telefone) e WhatsApp usa
`Lead.customFields.optOutWhatsApp` (por lead) — dois registros desconectados, então um titular
pode bloquear ligações e continuar recebendo WhatsApp, ou vice-versa. O contrato para os três donos
de canal ligarem nessa camada está em
`.agents/handoffs/onda-7/17-para-05-06-12-contrato-optout.md` (Status: aberto, Prioridade:
bloqueador).

**Decisão**: adotar `src/features/cadence/**` como o único modelo de domínio de opt-out da
plataforma daqui em diante — nenhum canal novo deve criar seu próprio campo de opt-out paralelo
(como `CallSuppression`/`optOutWhatsApp` fizeram antes desta decisão existir). Migração da
persistência e integração dos três canais existentes fica registrada como trabalho pendente, não
como decisão em aberto.

## Consequências

### Positivas
- **A.** Caminho para escalar filas/cron horizontalmente sem duplicar cron e sessões Baileys a cada
  réplica HTTP — hoje o maior fator limitante de escala documentado (`02-mapa-plataforma.md` §1).
- **B.** Ondas maiores executam mais rápido sem custo de qualidade comprovado, desde que as 6
  condições de isolamento/gate sejam mantidas.
- **C.** Um titular que pede para não ser mais contatado por um canal deixa de correr o risco de
  continuar recebendo contato por outro — fecha uma lacuna real de conformidade comercial.

### Negativas
- **A.** Até o corte ser aplicado, a plataforma carrega dois caminhos de execução de worker
  (documentado, não código morto: `worker.ts` só passa a valer depois do provisionamento real).
- **B.** Um teto mais alto aumenta o custo de um bisect de gate vermelho na integração se as
  condições listadas não forem respeitadas à risca — a regra depende de disciplina de processo, não
  só de ferramenta.
- **C.** Enquanto a integração dos 3 canais não estiver completa, o risco de contato indevido que
  esta decisão existe para fechar **continua existindo na prática** — a decisão está tomada, a
  proteção ainda não está em vigor.

## Alternativas Consideradas

**A.** Manter workers para sempre dentro de `server.ts`: rejeitado — é o fator já identificado como
o que mais limita escala horizontal, e qualquer réplica HTTP extra duplicaria cron e sessões
Baileys.

**B.** Manter o teto fixo em 3 agentes simultâneos: rejeitado depois de auditoria mostrar que a
causa raiz das falhas passadas nunca foi a contagem de agentes — manter o teto baixo não teria
evitado nenhum incidente histórico e reduziria a velocidade de execução sem ganho de segurança
real.

**C.** Manter opt-out por canal (como já existia para voz e WhatsApp antes desta decisão):
rejeitado porque não escala para novos canais e já produziu o cenário real descrito acima (bloqueio
em um canal não protege o titular nos demais).
