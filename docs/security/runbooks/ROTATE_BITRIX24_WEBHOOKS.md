# Runbook — Rotação dos webhooks de saída Bitrix24 (AtlasGR + TotalTrac)

## Status: ✅ Concluído (confirmado pelo dono do repositório, Sprint 01/Onda 13, 2026-08-18 — SEC-003)

Fase Final 0 (2026-08-16) reprovou por rotação não confirmada; uma confirmação informal registrada
em `final-fase-3.md` (2026-08-17) nunca foi formalmente reverificada/fechada no gate (ver
`.agents/completion/01-bloqueadores.md`). Nesta sprint, o dono do repositório confirmou
diretamente que os dois webhooks (AtlasGR e TotalTrac) já foram rotacionados — bloqueador fechado.
Este runbook permanece como referência para uma futura rotação.

## Por que isso é bloqueador, e por que é diferente de rotacionar uma API key comum

No Bitrix24, um **webhook de entrada** ("входящий вебхук") é uma URL do tipo
`https://<portal>.bitrix24.com.br/rest/<user_id>/<token>/` — **a própria URL contém o
token de autenticação**. Não existe um "header separado" para revogar: quem tem a URL completa tem
acesso de leitura/escrita ao portal com as permissões do usuário técnico associado, ponto. Por
isso "rotacionar" aqui significa **desativar a URL antiga no Bitrix e emitir uma nova**, não trocar
uma chave ao lado de uma URL estável.

Dois webhooks distintos estiveram versionados em texto claro (`connections.ts`,
`useBitrixIntegration.ts`, `public/tools/extrator-bitrix.html` — este servido publicamente — e
`extrator_bitrix (1).html`), remediados no working tree pelo commit `40a99c31`, mas recuperáveis no
histórico do git:

**Atualização — Portal Comercial (`public/tools/portal-comercial/`):** a ferramenta de referência
standalone que sucedeu `extrator-bitrix.html` oferece um botão opt-in "Salvar webhook neste
navegador" (`js/bitrix-api.js`, `CHAVE_WEBHOOK_LOCAL`), que grava o webhook ofuscado (XOR
reversível, não criptografia real) no `localStorage` do navegador de quem usar o botão. Isso é uma
credencial persistida **fora** de qualquer inventário centralizado (não é `BitrixConnection` nem
env var) — nenhum comando de servidor a alcança. Sempre que rotacionar um webhook, avise quem usa
essa ferramenta para clicar em "Esquecer webhook" (ou usar o DevTools para limpar
`atlas-extrator-bitrix-webhook` do `localStorage`) e colar a URL nova; não há como forçar essa
limpeza remotamente.

| Marca | Env var | URL exposta (padrão) |
|---|---|---|
| AtlasGR | `BITRIX24_WEBHOOK_URL` (ou legado `BITRIX_WEBHOOK_URL`) | `.../rest/450/…` |
| Total Trac | `TOTALTRAC_BITRIX24_WEBHOOK_URL` (ou legado `TOTALTRAC_BITRIX_WEBHOOK_URL`) | `.../rest/2486/…` |

Essas URLs dão acesso à base de CRM do Bitrix com dado pessoal real de prospecção (nome, telefone,
e-mail, empresa) — trate como incidente de dado pessoal, não só como higiene de credencial (ver
seção "LGPD e tenancy" em `.agents/prompts/15-seguranca-aplicada.md`).

**Atenção de arquitetura antes de rotacionar:** além dessas duas URLs default (usadas como
fallback de conexão quando a organização não tem `BitrixConnection` própria salva no banco —
ver `src/features/integrations/bitrix/service/connections.ts`), organizações podem ter conexões
Bitrix individuais persistidas em `BitrixConnection.webhookUrl` (criadas via
`POST /connections` do módulo de Integrações). Rotacionar só a env var não invalida uma conexão
salva no banco com a URL antiga — os dois precisam ser tratados.

## Passo 1 — Levantar todas as URLs a rotacionar

Antes de mexer no portal, gere o inventário completo — não rotacione só a env var padrão.

```bash
# No worktree, com acesso ao banco de homologação/produção (via Agente 01 ou acesso já concedido):
# lista organizationId + label das conexões Bitrix salvas, sem expor a URL/segredo no terminal
# compartilhado — rode isso numa sessão privada, nunca cole a saída num ticket/chat.
psql "$DATABASE_URL" -c "SELECT id, \"organizationId\", label, \"inboundEventsEnabled\" FROM \"BitrixConnection\";"
```

Para cada linha retornada, mais as duas env vars (`BITRIX24_WEBHOOK_URL`,
`TOTALTRAC_BITRIX24_WEBHOOK_URL`), você tem uma URL a rotacionar.

## Passo 2 — Gerar a nova URL no portal Bitrix24

Para **cada** portal (AtlasGR e Total Trac são portais Bitrix distintos):

1. Login no portal Bitrix24 (`https://<portal>.bitrix24.com.br`) com um usuário com permissão de
   administrador de aplicativos.
2. Vá em **Aplicativos → Webhooks** (ou **Developer resources → Other → Inbound webhook**, o nome
   varia por idioma/versão do portal).
3. Localize o webhook de entrada ativo (ex.: aquele terminando em `/rest/450/…` para AtlasGR,
   `/rest/2486/…` para Total Trac).
4. **Desative/exclua** esse webhook específico — isso invalida a URL antiga imediatamente,
   independente do que for feito nos passos seguintes.
5. Crie um **novo** webhook de entrada, com o mesmo escopo de permissões do anterior (confirme os
   escopos antes de salvar — CRM leads/deals leitura+escrita é o mínimo usado hoje pela integração;
   não amplie escopo "por segurança", isso viola minimização de dado da LGPD).
6. Copie a nova URL completa para um cofre de segredos — nunca para um arquivo do repositório,
   ticket, chat ou log.

Repita para o segundo portal.

## Passo 3 — Atualizar cada runtime e cada conexão persistida

### Env vars (Render)
1. Render → serviço do backend → **Environment**.
2. Atualize `BITRIX24_WEBHOOK_URL` com a nova URL do portal AtlasGR.
3. Atualize `TOTALTRAC_BITRIX24_WEBHOOK_URL` com a nova URL do portal Total Trac.
4. Se os nomes legados (`BITRIX_WEBHOOK_URL`, `TOTALTRAC_BITRIX_WEBHOOK_URL`) também estiverem
   setados no Render, atualize-os também ou remova-os — `connections.ts` lê o nome novo primeiro,
   mas uma env legada esquecida com a URL antiga é uma cópia do segredo vazado ainda viva.
5. Salvar dispara redeploy — confirme `Live` antes de seguir.

### Env vars (Vercel), se aplicável
Confirme se o frontend/edge consome essas env vars diretamente (hoje o uso conhecido é só
server-side via `connections.ts`, dentro de `server.ts`/Render). Se não houver consumidor no lado
Vercel, registre e pule.

### `.env` local
Cada agente/dev com ambiente local atualiza as duas variáveis a partir do cofre.

### Conexões persistidas em `BitrixConnection`
Para cada linha levantada no Passo 1 que **não** for a conexão default (ou seja, tem
`webhookUrl` próprio salvo no banco): atualize via a tela de Integrações do produto (fluxo normal
de edição de conexão), nunca via `UPDATE` direto no banco — o fluxo de edição já roda
`assertSafeWebhookUrl`/`testWebhook` (ver `connections.ts`), que valida a nova URL antes de
persistir. Editar direto no banco pula essa validação.

## Passo 4 — Validar que a NOVA URL funciona

```bash
curl -sS -o /dev/null -w '%{http_code}\n' "<NOVA_URL>/profile"
```

- **200** com corpo JSON válido confirma que a nova URL autentica no portal.
- Rode também o teste de conexão nativo do produto: tela de Integrações → Bitrix → "Testar
  conexão" (usa a mesma função `testWebhook` citada acima) para cada organização afetada.

## Passo 5 — Confirmar que a URL ANTIGA foi invalidada

```bash
curl -sS -o /dev/null -w '%{http_code}\n' "<URL_ANTIGA_DO_HISTORICO_GIT>/profile"
```

- **401/403/404** (o Bitrix normalmente responde com erro de autenticação ou "not found" para
  webhook desativado) confirma que a URL antiga não funciona mais. ✅
- **200** significa que o Passo 2.4 (desativar/excluir o webhook antigo) não foi de fato aplicado
  no portal — volte lá antes de fechar este runbook. Isso é o caso mais provável de falha: como o
  Bitrix permite ter múltiplos webhooks de entrada ativos ao mesmo tempo, criar um novo sem
  desativar o antigo deixa **os dois** válidos.

Só recupere a URL antiga do histórico do git dentro de uma sessão privada, exclusivamente para
este teste — nunca cole em ticket/chat/log. Ver `DECIDE_GIT_HISTORY_REWRITE.md` para a decisão
sobre remover essas URLs do histórico definitivamente.

## Passo 6 — Avisar usuários do Portal Comercial (ferramenta standalone)

Se algum operador comercial usa `public/tools/portal-comercial/` com o webhook salvo no navegador
(botão "Salvar webhook"), avise-o para clicar em "Esquecer webhook" e colar a URL nova — ver nota
no topo deste runbook. Isso não aparece em nenhum inventário de banco/env, então depende de aviso
manual.

## Passo 7 — Registrar a rotação

Atualize `.agents/completion/01-bloqueadores.md` (linha "Rotacionar os 2 webhooks Bitrix24") com
data, portais confirmados e se havia `BitrixConnection` adicional rotacionada além das env vars
default. Não inclua nenhuma URL, antiga ou nova, no registro.
