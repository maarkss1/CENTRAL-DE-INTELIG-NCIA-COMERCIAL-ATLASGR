# Runbook — Rotação da chave Bland AI

## Status: ✅ Concluído (confirmado pelo dono do repositório, Sprint 01/Onda 13, 2026-08-18 — SEC-003)

Fase Final 0 (2026-08-16) reprovou por rotação não confirmada; uma confirmação informal registrada
em `final-fase-3.md` (2026-08-17) nunca foi formalmente reverificada/fechada no gate (ver
`.agents/completion/01-bloqueadores.md`). Nesta sprint, o dono do repositório confirmou
diretamente que a chave já foi rotacionada — bloqueador fechado. Este runbook permanece como
referência para uma futura rotação (ex.: se a chave for comprometida de novo).

## Por que isso é bloqueador

A chave da API da Bland AI esteve versionada em texto claro em `scripts/call_bland_juliana.py`
(script já removido do working tree, commit `40a99c31`), num repositório com remote público no
GitHub. Ela **ainda é recuperável no histórico do git** enquanto ninguém a revoga do lado da Bland
— remoção do working tree não é rotação (ver "Mentira mais provável do seu domínio" em
`.agents/prompts/15-seguranca-aplicada.md`). A chave dispara ligações de voz pagas
(`BLAND_API_KEY`, consumida em `src/features/integrations/birth-voice/birthVoice.service.ts`) —
uma chave vazada permite gasto financeiro por terceiro, não só leitura de dado.

Nenhum agente de código pode executar este runbook sozinho: rotação de chave depende do portal da
Bland AI, que exige login humano autorizado na conta da organização.

## Onde a chave é consumida hoje

- `src/features/integrations/birth-voice/birthVoice.service.ts` — lê `process.env.BLAND_API_KEY`
  como fallback de credencial quando `config.baseUrl` contém `bland.ai`.
- **Gap encontrado durante esta auditoria:** `BLAND_API_KEY` não está listada em `.env.example`.
  Depois de rotacionar, adicione a entrada (nome da variável apenas, sem valor) em `.env.example`
  — hoje quem provisiona um ambiente novo não tem como saber que essa env existe sem ler o código.
  Isso é escopo do Agente 01 (dono de `.env.example`); abrir handoff se este runbook for executado
  antes da onda em que 01 estiver ativo.

## Passo 1 — Gerar a nova chave no portal Bland AI

1. Acesse `https://app.bland.ai` com a conta da organização (não uma conta pessoal — confirme com
   o gestor comercial responsável pela conta antes de prosseguir).
2. Vá em **Settings → API Keys** (o nome exato da seção pode variar conforme a versão do painel;
   procure por "API Keys" ou "Developers").
3. Clique em **Create new key** (ou equivalente). Dê um nome identificável, por exemplo
   `atlasgr-prospector-2026-08` (inclua o mês/ano de emissão — isso facilita auditoria futura de
   qual chave está em uso onde).
4. Copie o valor da nova chave para um gerenciador de senhas/cofre — **nunca** para um arquivo do
   repositório, chat, ticket ou log. Ela não deve existir em nenhum lugar fora do cofre de
   segredos e das variáveis de ambiente dos runtimes abaixo.

## Passo 2 — Atualizar a variável de ambiente em cada runtime

Atualize `BLAND_API_KEY` nos três lugares onde o backend roda ou é testado localmente. Não pule
nenhum — uma chave antiga esquecida num ambiente é a mesma classe de risco que não ter rotacionado.

### Render (produção/homologação)
1. Painel Render → serviço do backend (`server.ts`) → aba **Environment**.
2. Localize `BLAND_API_KEY`. Se não existir ainda como variável nomeada (hoje pode estar ausente
   de `.env.example`, ver gap acima), crie-a.
3. Cole o novo valor, salve. O Render dispara um novo deploy automaticamente ao salvar uma env var
   — confirme no painel que o deploy novo ficou `Live` antes de considerar o passo concluído.

### Vercel (se o frontend/edge functions também referenciarem a chave)
1. Verifique primeiro se `BLAND_API_KEY` é usada em algum caminho servido pela Vercel — hoje o
   consumo conhecido é só no backend Express/Render (`birthVoice.service.ts`, rodando dentro de
   `server.ts`). Se a checagem confirmar que não há uso no lado Vercel, registre isso e pule esta
   subseção; não crie uma variável sem consumidor.
2. Se houver uso confirmado: Vercel → projeto → **Settings → Environment Variables** → atualizar
   `BLAND_API_KEY` nos ambientes `Production` e `Preview` conforme aplicável → redeploy.

### `.env` local (qualquer agente com ambiente local configurado)
1. Cada desenvolvedor/agente com `.env` local próprio atualiza a linha `BLAND_API_KEY=` com o novo
   valor, retirado do cofre — nunca copiado de outro `.env` ou de mensagem.
2. `.env` nunca é commitado (já coberto por `.gitignore` — confirme com
   `git check-ignore -v .env` antes de seguir, deve retornar a regra do `.gitignore`).

## Passo 3 — Validar que a NOVA chave funciona

Rode uma chamada de teste de baixo custo contra a API da Bland (endpoint de leitura, não de
disparo de ligação) usando a nova chave, por exemplo:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H "authorization: $BLAND_API_KEY" \
  https://api.bland.ai/v1/calls?limit=1
```

- **200** confirma que a nova chave autentica corretamente.
- **401/403** indica que a chave nova não está ativa ainda ou foi digitada errada — não prossiga
  para o Passo 4 até resolver.

Se possível, valide também um fluxo real do produto (uma ligação de teste controlada, número
próprio da equipe, fora de horário comercial de prospecção) para confirmar que
`birthVoice.service.ts` está lendo a env atualizada em cada runtime (reinício/redeploy aplicado).

## Passo 4 — Confirmar que a chave ANTIGA foi invalidada

Rotação só está completa quando a chave antiga **para de funcionar**, não só quando a nova passa a
funcionar — são verificações independentes.

1. No portal Bland AI, **revogue/delete** a chave antiga explicitamente (não confie em rotação
   "silenciosa" — a maioria dos provedores mantém a chave antiga válida até revogação manual).
2. Rode a mesma chamada de teste do Passo 3, mas com o valor da chave **antiga** (recuperável do
   histórico do git, ver seção "Contexto" abaixo — use só para este teste, depois descarte):

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H "authorization: <CHAVE_ANTIGA>" \
  https://api.bland.ai/v1/calls?limit=1
```

- **401/403** confirma que a chave antiga foi de fato revogada. ✅ Rotação completa.
- **200** significa que a chave antiga ainda está ativa — volte ao portal e revogue-a antes de
  fechar este runbook.

## Passo 5 — Registrar a rotação

Atualize `.agents/completion/01-bloqueadores.md` (linha "Rotacionar a chave Bland AI") marcando
como resolvido, com data e responsável (sem incluir a chave em si). Se `.env.example` foi corrigido
no Passo 1, isso deve estar num commit separado do agente dono (01), não neste runbook.

## Contexto — commit onde a chave esteve exposta

A chave antiga é recuperável no histórico do git (script removido em `40a99c31`, mas o conteúdo
segue nos commits anteriores a esse). **Não** rode `git log`/`git show` contra esses commits e cole
o resultado em nenhum lugar fora de um terminal privado usado exclusivamente para o teste do Passo
4 — isso reintroduziria o mesmo vazamento que este runbook existe para fechar. Ver
`docs/security/runbooks/DECIDE_GIT_HISTORY_REWRITE.md` para a decisão separada sobre reescrever o
histórico.
