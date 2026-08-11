- De: Agente 04 (CRM e BI)
- Para: Agente 05 (Prospecção)
- Onda: 2
- Status: aberto
- Prioridade: alto

## Problema

`src/features/prospecting/services/whatsapp.service.ts` está quebrado e é uma implementação órfã,
duplicada da integração de WhatsApp real e em produção (`src/features/integrations/whatsapp/`, que
usa `@whiskeysockets/baileys`, já montada em `server.ts` como `/api/whatsapp/**`, com sessão por
tenant/QR via web).

Este arquivo específico:
- importa `whatsapp-web.js` e `qrcode-terminal` — nenhum dos dois está em `package.json`
  (`dependencies` nem `devDependencies`);
- por isso, `npx tsc --noEmit` e `npm run build` falham com módulo não encontrado sempre que este
  arquivo é incluído na compilação;
- não é importado por nenhum outro arquivo do repositório (`grep -r "prospecting/services/
  whatsapp.service" src` não retorna nenhum resultado) — é código morto que só ainda não quebrou o
  gate porque nada o referencia hoje.

Encontrei isso ao investigar `.agents/handoffs/onda-G/05-para-04-whatsapp.md`, que pedia para o CRM
usar exatamente este `whatsappService`. Não conectei o CRM a ele (ver seção "Resolução" naquele
handoff) — em vez disso usei a integração real (`src/features/integrations/whatsapp/`) que já
resolve o mesmo problema com sessão real, tenant e autenticação.

## Arquivo(s) envolvido(s)
- `src/features/prospecting/services/whatsapp.service.ts` (arquivo do seu domínio — não alterei).

## Alteração necessária
Decidir e executar uma das duas opções:
1. **Remover** o arquivo, se a prospecção não precisa de uma sessão de WhatsApp separada da do CRM
   (ambos são "a mesma organização", então a sessão de `src/features/integrations/whatsapp/` já
   cobre prospecção e CRM ao mesmo tempo — provavelmente a opção mais simples);
2. **Re-arquitetar** para consumir a integração real (`sendWhatsAppMessage`/`getWhatsAppStatus` de
   `src/features/integrations/whatsapp/whatsapp.service.ts`) em vez de abrir uma segunda sessão
   Baileys/whatsapp-web.js paralela — se houver alguma necessidade real de comportamento distinto
   entre prospecção fria e conversa de CRM que eu não tenha contexto suficiente para avaliar.

Enquanto o arquivo continuar sem uso, ele não quebra o build (TypeScript só falha em arquivos
efetivamente incluídos na compilação/importados), mas é dívida técnica visível e um risco: qualquer
import futuro dele (inclusive acidental, por autocomplete) quebra o typecheck imediatamente.

## Teste esperado
Depois da remoção/re-arquitetura: `npx tsc --noEmit` e `npm run build` continuam verdes, e não há
mais nenhuma referência a `whatsapp-web.js`/`qrcode-terminal` no código-fonte (`grep -r "whatsapp-web.js\|qrcode-terminal" src`).

## Contexto adicional
A integração real está em `src/features/integrations/whatsapp/`:
- `whatsapp.service.ts` — `initWhatsApp`, `getWhatsAppStatus`, `logoutWhatsApp`,
  `sendWhatsAppMessage(organizationId, number, text)`, sessão por tenant, status espelhado no Redis.
- `whatsapp.routes.ts` — `POST /connect`, `GET /status`, `POST /disconnect`, `POST /send`,
  `GET /conversations`, `GET /messages`, `GET /signals`, montada em `server.ts` como
  `/api/whatsapp/**` com `authenticateToken` + `requireTenant`.
- `components/WhatsAppChatPanel.tsx` + `hooks/useWhatsAppMessages.ts` — painel de conversa pronto,
  reusável (já usado por `src/features/prospecting/components/prospecting-hub/CandidateCard.tsx` e,
  a partir desta onda, também por `src/features/crm/components/LeadDetailDrawer.tsx`).
