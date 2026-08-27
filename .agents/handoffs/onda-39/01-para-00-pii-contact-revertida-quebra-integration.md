- De: 01
- Para: 00
- Onda: 39
- Status: resolvido
- Prioridade: alto

## Problema

Nesta onda, o Agente 01 implementou cifra em repouso (AES-256-GCM) para `Contact.{name,phone,
whatsapp,email,linkedin,observations}` (`src/lib/crypto/piiFields.ts`), com o próprio código já
documentando o risco de quebrar busca por igualdade/contains (achado de auditoria, não descoberto
agora). O unit test (sem Postgres real) passou, e a mudança foi integrada. O gate de CI com
Postgres real (que este ambiente de execução não tem) revelou quebra CONFIRMADA, não só teórica,
em 4 arquivos de `test:integration`:

- `tests/integration/emailReplyTracking.test.ts` (CYC-003) — resolve o lead pelo e-mail do contato
  (`where: { contact: { email } }`); com o e-mail cifrado (IV aleatório por valor, nunca produz o
  mesmo ciphertext duas vezes), a busca para de casar — 3 dos 3 testes deste arquivo falharam.
- `tests/integration/whatsapp-optout-gating.test.ts` — casamento de opt-out por telefone/e-mail do
  contato — mesmo problema.
- `tests/integration/document-signature.routes.test.ts` — lê o e-mail do contato por um
  `include`/`select` aninhado a partir de outro model (ex.: `Lead`); a extensão do Prisma em
  `src/lib/prisma.ts` só decifra no nível do model da própria operação
  (`ENCRYPTED_FIELDS[model]`), não em relações incluídas — o e-mail chega como ciphertext cru para
  quem espera texto puro. Este é um modo de quebra que nem o Agente 01 tinha antecipado no relatório
  original (só citou `ContactService.findAll`/`deduplication.worker.ts`).
- `tests/integration/auto-anonymize-sweep-idempotency.test.ts` — contagem/filtro de sweep afetados
  pelo mesmo problema de igualdade sobre coluna cifrada.

## Resolução

Revertido: `Contact` removido de `ENCRYPTED_MODEL_FIELDS` (`src/lib/crypto/piiFields.ts`). Nenhuma
outra mudança de `prisma.ts` precisou ser revertida — o mecanismo é genérico, chaveado só pelo mapa.
Teste unitário reescrito para testar o mecanismo genericamente (usando `BitrixConnection`, que
continua cifrado) e ganhou um guard de regressão explícito (`Contact` deve continuar ausente do
mapa) para não ser readicionado silenciosamente sem resolver o problema de busca primeiro.

## Arquivo(s) envolvido(s)

- `src/lib/crypto/piiFields.ts`
- `src/lib/crypto/__tests__/piiFields.unit.test.ts`

## Teste esperado

`npm run test:unit` completo e os 4 arquivos de `test:integration` citados acima voltam a passar
contra Postgres real (não pude reexecutar `test:integration` neste ambiente — sem Docker/Postgres
aqui; a reversão restaura exatamente o comportamento anterior a esta onda, que era conhecido-
funcional).

## Contexto adicional

Cifrar PII de `Contact` em repouso continua sendo um gap real do checklist CPI. Para reativar, é
necessário resolver antes um dos dois caminhos (decisão de produto/arquitetura, não técnica pura):
1. Índice determinístico separado (ex.: HMAC-SHA256 de um valor normalizado) para permitir
   igualdade exata sem expor o texto puro, mantendo o campo principal com IV aleatório.
2. Decifrar em relações incluídas também (estender a extensão do Prisma para percorrer `include`/
   `select` aninhados) — resolve o caso de leitura, mas não o de `where` por igualdade.
Nenhum dos dois foi implementado nesta rodada.
