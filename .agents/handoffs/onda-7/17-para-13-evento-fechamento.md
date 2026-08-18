- De: 17
- Para: 13
- Onda: 7
- Status: resolvido
- Prioridade: alto
## Problema
`AUTONOMIA_COMERCIAL_24X7.md` → "Critério honesto de Closer autônomo" já proíbe o modelo de
declarar um negócio como ganho por texto gerado, e é seu domínio (`src/features/intelligence/**`,
guardrails) que hoje faz valer essa proibição. Minha entrega 5 (`.agents/prompts/17-cadencia-ciclo-
receita.md`) constrói o **caminho legítimo** que substitui a proibição por um evento real: proposta
versionada → assinatura/aceite → `DealClosureEvent` verificável → só então o Lead muda para
`Negocios_Ganhos`. Meu prompt exige que eu acorde com você, por escrito, exatamente qual evento
conta como fechamento **antes de implementar** — este handoff é esse acordo proposto.

## Arquivo(s) envolvido(s)
- Meu: `src/features/cadence/domain/dealClosure.ts` (guarda pura, já implementada e testada com os
  3 tipos abaixo).
- Proposto para schema (ver `17-para-01-schema-cadencia-optout-proposta.md`, seção 5):
  `DealClosureEvent` (ledger append-only).
- Seu, para revisão/uso: onde quer que o guardrail hoje impeça o Closer de marcar ganho
  (`src/features/intelligence/services/guardrails.service.ts` ou equivalente no seu escopo desta
  onda) — não editei, é seu arquivo.

## Alteração necessária

Proposta de evento verificável — exatamente 3 tipos, todos exigindo `evidenceRef` (não texto
livre do modelo, um id real de outro registro):

```ts
export type DealClosureEventType =
    | 'signature_completed'   // CrmDocumentSignatureRequest.status transicionou para 'Signed' via webhook do provedor real
    | 'payment_confirmed'     // confirmação de pagamento de um gateway real (fora de escopo desta onda — placeholder para quando existir)
    | 'manual_crm_confirmation'; // vendedor humano confirma explicitamente no CRM, com nota obrigatória
```

Guarda pura já implementada (`src/features/cadence/domain/dealClosure.ts`):
```ts
export function isDeterministicCloseEvent(event: DealClosureEventInput): boolean {
    // true só quando type é um dos 3 acima E evidenceRef é uma referência não-vazia a outro
    // registro real (id de CrmDocumentSignatureRequest, id de transação de pagamento, ou id de
    // Activity/Note que registra a confirmação manual) — nunca aceita texto gerado por modelo
    // como evidenceRef, nunca aceita 'ai_inferred'/'model_judgment' como type.
}
```

**O que isto muda para o seu guardrail**: hoje a trava é "o Closer nunca pode marcar ganho" (uma
proibição absoluta). Com isto, a trava correta passa a ser "o Closer nunca marca ganho
diretamente — só um `DealClosureEvent` de um dos 3 tipos acima, criado por um caminho que não é o
texto do modelo, pode mover `Lead.status` para `Negocios_Ganhos`". O Closer pode **recomendar**
("proponha fechamento", "envie para assinatura"), nunca **executar** a transição de status
sozinho. Se seu guardrail atual intercepta uma tentativa de `UPDATE Lead SET status =
'Negocios_Ganhos'` vinda do agente, ele deveria continuar bloqueando isso — o novo caminho não
passa por ali, passa pelo serviço de fechamento em `src/features/cadence/**` reagindo a um evento
já validado.

## Teste esperado
- Evento com `type: 'manual_crm_confirmation'` e `evidenceRef` vazio → rejeitado (não fecha nada).
- Evento fabricado com um `type` fora dos 3 listados (ex.: um agente tentando injetar
  `'ai_judgment'`) → rejeitado.
- Evento válido (`signature_completed` com `evidenceRef` = id real de
  `CrmDocumentSignatureRequest`) → aceito, e é isso (não o texto do Closer) que move o Lead.
- Teste do seu lado: confirmar que nenhum caminho em `src/features/intelligence/**` consegue
  escrever `Lead.status = 'Negocios_Ganhos'` fora do serviço de fechamento acima.

## Contexto adicional
Sem esperar sua resposta síncrona (rodamos em paralelo nesta onda, conforme orientação do
Coordenador) — implementei a guarda em `src/features/cadence/domain/dealClosure.ts` e
`src/features/cadence/__tests__/dealClosure.test.ts` já assumindo esta proposta como a superfície
de contrato. Se você tiver um evento adicional que precise contar como fechamento verificável
(algo específico do seu guardrail que eu não conheço), me avise por handoff de volta e eu ajusto o
enum — a lista de 3 tipos acima é o mínimo que cobre a entrega 5 do meu prompt, não uma lista
fechada por princípio.

## Resolução (Sprint 00/Onda 12 — GOV-006, 2026-08-18)
Confirmado em `prisma/schema.prisma`: modelo `DealClosureEvent` e enum `DealClosureEventType`
presentes, refletindo o contrato proposto aqui. Status corrigido de `aberto` para `resolvido`.
