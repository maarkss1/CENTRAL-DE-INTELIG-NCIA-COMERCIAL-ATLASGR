# AGENTS.md — Cadência Multicanal e Ciclo de Receita

## Dono
Agente 17 — Cadência Multicanal e Ciclo de Receita

Este arquivo governa esta pasta e todas as subpastas. Criada na Onda 7
(`.agents/prompts/17-cadencia-ciclo-receita.md`).

## Pode alterar
- tudo dentro de `src/features/cadence/**` — domínio, aplicação, infraestrutura de teste,
  apresentação.
- `src/features/crm/services/` no que for específico de proposta e fechamento, **só com acordo
  prévio por escrito com o Agente 04** (dono de `src/features/crm/**`).

## Não pode
- Não editar `prisma/schema.prisma` nem migrations — propor por handoff ao 01/01A
  (`.agents/handoffs/onda-7/17-para-01-schema-cadencia-optout-proposta.md`).
- Não editar `src/App.tsx`, navegação ou Sidebar — propor por handoff ao 02
  (`.agents/handoffs/onda-7/17-para-02-rota-cadencia.md`).
- Não editar `src/features/integrations/**` (e-mail/SMTP é do 05; WhatsApp, Google Workspace e o
  resto são do 06; voz é do 12) — consumir por contrato de porta/interface, nunca por edição
  direta desses arquivos.
- Não editar `src/features/intelligence/**` (guardrails do enxame, Agente 13) — o evento de
  fechamento determinístico é um contrato acordado (
  `.agents/handoffs/onda-7/17-para-13-evento-fechamento.md`), não uma edição direta.

## Arquitetura desta pasta
- `domain/` — lógica pura, sem I/O: `optOut.ts`, `cadence.ts`, `replyTracking.ts`,
  `scheduling.ts`, `proposal.ts`, `dealClosure.ts`. Testável sem banco/rede — é onde a maior parte
  das regras de negócio críticas (LGPD, trava de fechamento) vivem, de propósito.
- `application/` — orquestra as portas (`*Repository`, `*Port`) em cima do domínio:
  `optOutService.ts`, `cadenceService.ts`.
- `infra/` — implementações em memória das portas, usadas nos testes
  (`InMemoryOptOutRepository`, `InMemoryCadenceRunRepository`). O adaptador Prisma real
  (implementando as mesmas interfaces) só pode ser escrito depois que o schema proposto ao 01 for
  aplicado.
- `__tests__/` — um arquivo por módulo de domínio/aplicação.

## Definição de pronto local
- toda regra que decide se algo é enviado/bloqueado/agendado/fechado é lógica pura, testada sem
  mock de rede.
- nenhuma escrita otimista: "enviado"/"agendado"/"fechado" só depois de confirmação real da
  porta correspondente (nunca antes de o canal/scheduler/webhook confirmar).
- opt-out é a trava mais forte deste domínio — qualquer função nova que dispare contato externo
  passa por `isOptedOut`/`assertNotOptedOut` antes de qualquer outra regra.
- fechamento de negócio (`Negocios_Ganhos`) só por `DealClosureEvent` aceito por
  `isDeterministicCloseEvent` — nunca por texto/decisão de agente de IA.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- `npm run test:unit -- src/features/cadence`
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
