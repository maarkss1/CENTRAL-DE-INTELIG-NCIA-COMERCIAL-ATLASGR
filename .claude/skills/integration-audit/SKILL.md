---
name: integration-audit
description: Use ao investigar se uma integração externa ou interna (Bitrix24, AI gateway, Google Workspace, WhatsApp/Baileys, 3CX, Birth Voice, Apollo/Hunter, e-mail) é confiável — credencial, retry, timeout, rate limit, idempotência, webhook, paginação. Bitrix24 já tem auditoria completa em BITRIX24-LEAD-FLOW-AUDIT.md — leia antes de reauditar do zero.
---

# Integration Audit — Central de Inteligência Comercial ATLASGR

## Quando usar

Ative para qualquer pergunta sobre confiabilidade de uma integração externa específica: "a
sincronização do Bitrix está correta?", "o que acontece se a IA cair?", "o WhatsApp reconecta
sozinho?". Combine com `api-contracts` quando a dúvida envolver o formato de dado trafegado, não só
a confiabilidade do transporte.

## Missão

Auditar as integrações reais deste projeto (não hipotéticas) e produzir uma matriz objetiva de
estado por integração. "Integração" aqui inclui tanto serviços externos quanto a ponte
frontend↔backend↔fila quando relevante (ex.: workers BullMQ que dependem de Redis).

## Antes de editar

**Bitrix24 já tem uma auditoria completa e recente** (`BITRIX24-LEAD-FLOW-AUDIT.md`, 2026-08-09,
leitura direta de código com evidência `arquivo:linha`, testes executados, veredito quantificado).
Leia esse documento inteiro antes de auditar Bitrix de novo — não repita o trabalho. Sua tarefa,
quando o escopo for Bitrix, é: (1) confirmar se os achados P0-P2 ainda são verdade no código atual
(o schema já ganhou `bitrixSyncStatus`/`bitrixSyncError`/`bitrixSyncedAt` e
`@@unique([organizationId, bitrixLeadId/bitrixDealId])` desde o audit — verifique se isso já
resolveu P1-3/P2-3 antes de repeti-los como abertos), e (2) aprofundar apenas o que a pergunta do
usuário pedir além do que já está documentado.

Para as demais integrações, não existe auditoria prévia formal — construa a matriz do zero, mas
consulte `PRODUCT_EXPERIENCE_CENTRAL_ATLASGR.md`/`REMEDIACAO_FINAL_PROSPECTOR_ATLASGR.md` para
contexto de produto já registrado.

## Investigação — integrações reais presentes no código

| Integração | Onde | Observação real |
|---|---|---|
| **Bitrix24** | `src/features/integrations/bitrix/service/{client,leads,deals,outboundSync,syncRules,customFields,connections}.ts`, `bitrix.routes.ts`, `bitrix.webhook.ts` | Cliente HTTP (`client.ts`) sólido — retry+backoff+jitter (`BITRIX_MAX_ATTEMPTS=4`), timeout 15s, respeita `Retry-After`. Camada de negócio incompleta — ver auditoria dedicada. |
| **AI gateway** (Groq → OpenAI → Gemini → LiteLLM/Ollama local) | `src/lib/ai/gateway.ts` | **Não há Anthropic neste projeto** — não assuma isso ao investigar. Circuit breaker real (Redis, `ai-gateway:circuit:*`, 3 falhas → 30s cooldown, fallback in-memory se Redis cair), retry com backoff sugerido pelo provedor, timeout (`AI_FALLBACK_TIMEOUT_MS`, default 60s), redação de segredo de mensagens de erro do provedor (`sanitizeProviderMessage`) antes de logar/expor. |
| **Google Workspace** (Gmail readonly + Calendar readonly) | `src/features/integrations/google/google.service.ts`, `google.routes.ts` | OAuth2 via `google-auth-library`, `redirect_uri` **separado** do OAuth de login do better-auth (mesmo client id/secret, endpoints diferentes — não confundir os dois fluxos ao depurar). `state` HMAC-assinado sem depender de sessão de servidor. Timeout explícito de 15s (`OAUTH_TOKEN_TIMEOUT_MS`). `GOOGLE_MAPS_API_KEY` é uma chave separada (usada em prospecção, não OAuth). |
| **WhatsApp** | `src/features/integrations/whatsapp/whatsapp.service.ts`, `whatsappMessage.service.ts` | Via **Baileys** (`@whiskeysockets/baileys`) — protocolo não-oficial do WhatsApp Web, QR code por tenant, não a API oficial de negócios. Sessões por `organizationId` em `Map`, reconexão com backoff exponencial (até 5 tentativas, até 60s). Persistência em `WhatsAppMessage`. Risco estrutural a considerar: dependência de protocolo não-oficial pode quebrar sem aviso em atualização do WhatsApp — trate isso como risco de produto ao classificar severidade, não só bug de código. |
| **3CX** (telefonia) | `src/features/integrations/threecx/{threecx.routes,threecx.service}.ts` | Webhook próprio, montado pré-autenticação em `server.ts` (`threecxWebhookRouter`) — confirme validação de origem/assinatura nesse webhook, já que ele intencionalmente ignora `authenticateToken`. |
| **Birth Voice** (IA de voz/cold call) | `src/features/integrations/birth-voice/*` (`service`, `webhook`, `coldCall.policy.ts`, `callSuppression.service.ts`) | Mesmo padrão de webhook pré-auth do 3CX. `callSuppression.service.ts` é a lógica de "não ligar de novo" — auditar se ela é respeitada por todos os pontos de disparo de chamada, não só o principal. |
| **Apollo.io / Hunter.io** (enriquecimento) | `src/features/prospecting/services/apollo/*`, `hunter.service.ts` | `PROSPECTING_PROVIDER_MODE=hybrid` controla mistura de provedores. **Cuidado**: existe um segundo pipeline Apollo órfão (`src/lib/enrichment/apollo.ts` + `src/lib/queue/enrich.worker.ts`, nunca instanciado em `server.ts`) com fallback de dado **mockado/fabricado** quando falta API key — não confundir com o pipeline ativo, e tratar a existência desse órfão como achado de `error-resilience`/dívida técnica, não como integração viva. |
| **E-mail/SMTP** | `src/lib/email/mailer.ts` (Nodemailer) | `SMTP_HOST`/`PORT`/`SECURE`/`USER`/`PASS`/`FROM`, todas opcionais por design — sem `SMTP_HOST`, o fluxo de "aprovar e-mail" cai para abrir o cliente de e-mail do usuário. Confirme se esse fallback é comunicado ao usuário na UI, ou se parece um envio real que não aconteceu. |
| **Langfuse** (observabilidade de LLM, não integração de negócio) | `src/lib/langfuse.ts` | Relevante para auditar rastreabilidade de chamadas de IA, não para o fluxo de dado do produto. |

## Matriz padrão a preencher por integração

| Frontend | Backend | Credencial | Persistência | Teste | Produção |
|---|---|---|---|---|---|

Para cada célula, cite arquivo real — "Credencial" deve dizer exatamente qual env var/tabela guarda
o segredo e se está criptografado em repouso (ex.: `BitrixConnection.webhookUrl` via AES-256-GCM,
`src/lib/crypto/secretFields.ts`) ou em texto puro.

## Para cada integração, investigar

- **Origem da credencial** — env var (nome exato) vs. registro por tenant (tabela) vs. os dois
  coexistindo (Bitrix tem ambos: `BitrixConnection` por org + `BITRIX24_WEBHOOK_URL` como fallback
  default — confirme qual vence quando os dois existem).
- **Criptografia** — segredo em repouso está cifrado (`secretFields.ts`) ou plano?
- **Refresh token** — para OAuth (Google), o refresh acontece automaticamente ou expira
  silenciosamente?
- **Timeout** — toda chamada de rede tem timeout explícito, ou pode travar indefinidamente?
- **Retry** — no nível certo (HTTP vs. job de fila)? A auditoria Bitrix já achou uma lacuna real
  aqui: retry existe em `client.ts` (nível HTTP), mas não no nível de job BullMQ — confirme se
  outras integrações têm a mesma lacuna.
- **Rate limit** — respeitado do lado de fora (nosso rate limit) e reconhecido do lado de dentro
  (429/erro do provedor tratado, não só propagado como 500 genérico)?
- **Erro / fallback** — erro do provedor vira erro visível ao usuário, ou desaparece em
  `logger.warn` (ver `error-resilience`)?
- **Logs** — tem `correlationId` rastreável (padrão já bom na camada HTTP do Bitrix — reuse essa
  referência ao avaliar as demais)?
- **Webhook** — validação de origem/assinatura, idempotência (reenvio do mesmo evento não duplica
  efeito), e se está montado antes ou depois de `authenticateToken` em `server.ts` (webhooks
  legítimos ficam antes, de propósito — não é bug, mas exige validação alternativa de origem).
- **Idempotência / duplicidade** — reprocessar o mesmo evento/registro não deveria criar duplicata;
  confirme `@@unique` no schema (ver `database-integrity`) e/ou checagem por chave de negócio
  (e-mail/telefone/CNPJ) antes de criar.
- **Paginação** — toda integração que lista recursos externos precisa seguir o cursor até o fim
  (ou até um limite explícito e logado). A lacuna real conhecida é o worker de sync automático do
  Bitrix (`syncRules.ts`), que nunca segue `next` — confirme se qualquer outra integração paginada
  (Apollo, Google) tem o mesmo padrão de bug.

### Bitrix24 — atenção especial (conforme já mapeado)

Import, export, leads, negócios, contatos, empresas, atualização de estágio, custom fields
(`UF_CRM_*`), webhooks, paginação, rate limiting e duplicidade **já foram auditados** — use a tabela
de severidade (`BITRIX24-LEAD-FLOW-AUDIT.md` seção 24) como checklist do que confirmar, não como
lista para redescobrir do zero.

## Processo de execução

1. Identifique a integração em escopo e verifique se já existe auditoria (Bitrix: sim). Se sim,
   comece por lá.
2. Preencha a matriz padrão com evidência de arquivo real, não suposição.
3. Percorra a lista "Para cada integração, investigar" e classifique cada ponto como
   confirmado-ok / confirmado-falho / não verificável neste ambiente.
4. Se o achado for novo (não documentado antes), classifique severidade usando a mesma escala de
   `release-readiness` (BLOCKER/CRITICAL/HIGH/MEDIUM/LOW) e proponha correção mínima.

## Evidências necessárias

Cite `arquivo:linha` para cada afirmação sobre comportamento de retry/timeout/paginação — essas são
verificáveis por leitura direta de código sem precisar de credencial real. Para comportamento que só
aparece em runtime (rate limit real do provedor, expiração de token), prefira teste de integração
existente (ex.: os 17 testes do cliente Bitrix já cobrem retry/backoff/429 — rode-os em vez de
inferir) ou registre como não verificável sem acesso a sandbox real da integração.

## Regras de implementação

Nunca corrija uma integração alterando credencial/config de produção diretamente — isso é ação de
alto risco fora do escopo desta skill (ver seção "Quando parar"). Correções de código (adicionar
timeout, corrigir paginação) seguem o padrão já usado por integrações saudáveis do mesmo projeto
(ex.: `client.ts` do Bitrix como referência de retry+backoff bem feito) em vez de inventar um padrão
novo por integração.

## Validação

- Testes existentes da integração, se houver (o cliente Bitrix tem 17 testes reais — rode-os antes
  de declarar qualquer mudança nessa camada).
- `verify:integrations`/`verify:ai` (`scripts/verify-integrations.ts`, `scripts/verify-ai-studio.ts`)
  — scripts já existentes no projeto para checagem de configuração; rode-os quando disponíveis em
  vez de reinventar a verificação.
- Nunca valide contra credenciais reais de produção — use sandbox/ambiente de teste da integração.

## O que não fazer

- Não reaudite Bitrix do zero — leia o documento existente primeiro.
- Não assuma Anthropic/Claude como provedor de IA deste projeto — o gateway real é
  Groq/OpenAI/Gemini/LiteLLM.
- Não confunda o pipeline Apollo ativo (`prospecting.service.ts`) com o órfão
  (`lib/enrichment/apollo.ts`) — são dois caminhos de código distintos.
- Não altere credencial, webhook URL ou configuração de integração em produção sem confirmação
  explícita do usuário.

## Quando parar e pedir aprovação de escopo/Git

Pare antes de: reconectar/reativar código órfão de integração (ex.: o worker Apollo órfão com
fallback mock — reconectá-lo sem entender o mock é um risco real de gravar dado fabricado como se
fosse real); mudar o comportamento de um webhook em produção; ou remover uma integração/pipeline
duplicado sem confirmação do dono do produto (ver recomendação P1-2 do audit Bitrix: "remover ou
documentar explicitamente por que continua no repositório" — a decisão é do usuário, não da skill).

## Critérios de conclusão

- [ ] Matriz preenchida com evidência de arquivo real para cada integração em escopo.
- [ ] Achados já documentados em `BITRIX24-LEAD-FLOW-AUDIT.md` foram confirmados como ainda válidos
      (ou marcados como resolvidos) antes de citados.
- [ ] Nenhum achado novo de retry/timeout/paginação/idempotência foi reportado sem `arquivo:linha`.
- [ ] Código órfão identificado foi reportado como tal (não corrigido/reconectado sem aprovação).
