# Runbook — Rotação da chave Google Gemini exposta no histórico

## Status: ⚠️ Aberto — depende de ação humana no Google AI Studio / Google Cloud Console

Achado durante a triagem dos 45 segredos históricos sinalizados pelo `gitleaks` em modo
`workflow_dispatch` (ver `docs/security/GITLEAKS_HISTORICAL_FINDINGS_2026-09-05.md` para o
levantamento completo). Nenhum agente de código pode executar este runbook sozinho: revogar/gerar
uma chave do Google AI Studio exige login humano na conta que a emitiu.

## Por que isso é um achado real, não um falso positivo

Dois arquivos de teste ad-hoc, nunca parte do produto (`test-gemini.ts`, `test-gemini-quota.ts`,
commits `40242d7e`/`db20c1f3`, 17/07/2026, autor `MaarksN`), continham a mesma chave de API do
Google Gemini em texto puro:

```ts
const ai = new GoogleGenAI({ apiKey: 'AQ.Ab8...' }); // valor completo só no histórico do git
```

Os dois arquivos **não existem mais** na árvore de trabalho atual (`git ls-files` confirma) — mas a
chave continua **recuperável no histórico do git** por qualquer pessoa com acesso de leitura ao
repositório (`git show 40242d7e5463ee48f3daab9bdc1a84501c6dfa58:test-gemini.ts`), enquanto ninguém
a revogar do lado do Google. Remoção do working tree não é rotação — mesmo princípio já registrado
em `ROTATE_BLAND_AI_KEY.md`.

**Confirmado nesta triagem**: a dependência `@google/genai` não está no `package.json` atual, e
nenhum caminho de código de produção (`src/lib/ai/gateway.ts`, `src/lib/ai/local-embeddings.ts`,
`.env.example`) referencia essa biblioteca ou instancia `GoogleGenAI` diretamente — o gateway de IA
real do produto usa Groq → OpenAI → Gemini (via `GEMINI_API_KEY`/rota própria) → LiteLLM/Ollama, um
caminho diferente do script isolado que vazou a chave. Ou seja: **não há indício de que esta chave
específica esteja em uso pelo produto hoje**, mas isso não implica que ela esteja inválida — ela
pode continuar ativa na conta pessoal/projeto Google que a emitiu, disponível para qualquer um que
a recupere do histórico. Enquanto não for revogada, é um vazamento ativo de credencial de terceiro
(Google), com custo/quota potencialmente cobrados na conta do emissor.

## Passo 1 — Localizar a chave no Google AI Studio / Google Cloud Console

1. Acesse `https://aistudio.google.com/app/apikey` (ou, se o projeto foi criado via Google Cloud
   Console, `https://console.cloud.google.com/apis/credentials`) com a conta que gerou a chave —
   provavelmente a conta pessoal do autor do commit (`MaarksN`), confirme antes de prosseguir.
2. Procure por uma chave cujo prefixo bata com `AQ.Ab8RN6Kc...` (as chaves do Google AI Studio no
   formato `AQ.*` são específicas dessa plataforma — não confundir com chaves `AIza...` do Cloud
   Console "clássico", que é outro formato).

## Passo 2 — Revogar a chave antiga

1. Delete/revogue a chave localizada no Passo 1. Esta ação não afeta o produto (confirmado no
   Passo 0 acima: nenhum caminho de código em produção a consome).
2. Se a mesma conta Google tiver outras chaves ativas de uso legítimo em outros projetos pessoais
   do autor, **não revogue por engano** — confirme o prefixo exato antes de deletar.

## Passo 3 — Confirmar a revogação

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  "https://generativelanguage.googleapis.com/v1beta/models?key=<CHAVE_ANTIGA>"
```

- **400/401/403** confirma que a chave foi revogada. ✅ Rotação completa.
- **200** significa que a chave ainda está ativa — volte ao Passo 1 e revogue-a antes de fechar
  este runbook.

Não copie o valor da chave para nenhum lugar fora deste teste pontual em terminal privado — use e
descarte, mesmo princípio de `ROTATE_BLAND_AI_KEY.md` (Passo 4) e
`DECIDE_GIT_HISTORY_REWRITE.md`.

## Passo 4 — Registrar a rotação

Depois de confirmado o passo 3, adicione o fingerprint dos dois achados
(`40242d7e5463ee48f3daab9bdc1a84501c6dfa58:test-gemini.ts:generic-api-key` e
`db20c1f3e5cd53f3c0be462502548bfafa850587:test-gemini-quota.ts:generic-api-key` — confirmar o
número de linha exato com `gitleaks detect` local antes de colar) em `.gitleaksignore`, com
comentário citando esta rotação e a data, seguindo o mesmo padrão já usado para o achado de senha
do Supabase nesse arquivo. Atualize também o status deste runbook para "✅ Concluído".

## Sobre reescrever o histórico

Igual ao caso da chave Bland AI e dos webhooks Bitrix24: revogar a chave já neutraliza o vazamento
(o valor recuperável no histórico deixa de ter qualquer utilidade). Reescrever o histórico do git
(`git filter-repo`/BFG) para remover o literal é uma decisão separada, de custo/risco bem maior
(reescreve hashes de todo commit downstream) — ver `DECIDE_GIT_HISTORY_REWRITE.md` para os
critérios já usados nas outras rotações. Não recomendado só por causa deste achado isolado.
