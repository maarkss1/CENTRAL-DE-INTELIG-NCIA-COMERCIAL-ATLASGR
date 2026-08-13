- De: 06
- Para: 04
- Onda: 7
- Status: resolvido
- Prioridade: normal
## Problema
É necessário adicionar um botão "Qualificar via Voz" na interface do CRM.
## Arquivo(s) envolvido(s)
src/features/crm/components/LeadDetailDrawer.tsx
## Alteração necessária
Injetar um botão "Qualificar via Voz" que faça uma requisição POST fetch para http://localhost:3000/api/webhooks/bland passando name, phone_number, e company.
## Teste esperado
Disparar a requisição POST com o payload correto.
## Contexto adicional
Fora do escopo do Agente 06. Favor implementar.

## Resolução

Um commit anterior a esta onda (`2423c5f feat(crm): Add voice qualification button (Birthub Voices
integration)`) já tinha adicionado o botão "Qualificar via Voz" em `LeadDetailDrawer.tsx`, mas
implementava literalmente o que este handoff pedia: um `fetch` direto do navegador para uma URL
hardcoded (`http://localhost:3001/api/webhooks/bland`, com fallback ainda mais frágil via
`VITE_VOICE_HUB_URL`), sem autenticação, sem tenant, sem checar a lista de opt-out, e tratando
qualquer erro com uma mensagem genérica única.

Investigação (Onda 2, Agente 04) encontrou que já existe uma integração real e completa em
`src/features/integrations/birth-voice/` (dono: Agente 06/12 — não alterada por mim):
- `birthVoice.service.ts::callLead(organizationId, leadId)` — resolve o telefone discável do lead
  (`pickCallablePhone`), valida config do SDR de voz, e **checa a lista de opt-out antes de ligar**
  (o fetch direto do frontend ignorava essa checagem por completo — um risco de compliance real).
- `birthVoice.routes.ts` — `POST /api/integrations/birth-voice/call/:leadId`, montada com
  `authenticateToken` + `requireTenant` + `requireRole(['ADMIN','GESTOR','VENDEDOR'])` em
  `server.ts`, devolvendo erros distintos e com status HTTP corretos: 503 (SDR não configurado),
  422 (lead sem telefone discável), 409 (número em opt-out).

Reescrevi `handleVoiceCall` em `src/features/crm/components/LeadDetailDrawer.tsx` para chamar essa
rota via `api.post('/api/integrations/birth-voice/call/' + lead.id)` (cliente HTTP relativo já
usado no resto do arquivo, com token/tenant automáticos) em vez do fetch hardcoded. O toast de erro
agora repassa a mensagem específica devolvida pela rota (não configurado / sem telefone / opt-out)
em vez de um texto genérico único. Nenhum arquivo de `src/features/integrations/**` foi alterado.
