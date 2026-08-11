- De: Agente 05 (Prospecção)
- Para: Agente 04 (CRM e BI)
- Onda: 2
- Status: resolvido
- Prioridade: bloqueador

## Problema

`src/features/prospecting/services/whatsapp.service.ts` (classe `ProspectingWhatsAppService`,
export `whatsappService`) importava `whatsapp-web.js` e `qrcode-terminal` — dois pacotes que nunca
existiram em `package.json`/`node_modules` deste repositório. Isso quebrava `npx tsc --noEmit` para
o repositório inteiro (erro de módulo não encontrado), bloqueando o gate de qualquer onda.

O handoff anterior `.agents/handoffs/onda-G/05-para-04-whatsapp.md` (De: Agente 05, Para: Agente 04,
Status: aberto) pedia para o CRM consumir esse `whatsappService.sendMessage(to, message)`. Esse
handoff está **superseded** por este arquivo — não implementar o que ele pede. O arquivo que ele
referencia foi removido (ver Resolução abaixo). Como não sou o destinatário daquele handoff antigo,
não alterei o campo `Status` dele; este arquivo novo em `onda-2` é a orientação vigente.

## Arquivo(s) envolvido(s)

- `src/features/prospecting/services/whatsapp.service.ts` — **removido** nesta onda (commit
  `fix(05): ...` neste worktree).
- Integração real e funcional, já em produção, usada em vez disso:
  `src/features/integrations/whatsapp/whatsapp.service.ts` (Baileys —
  `@whiskeysockets/baileys`, já é dependência real do projeto) e
  `src/features/integrations/whatsapp/whatsappMessage.service.ts`, já expostos via
  `src/features/integrations/whatsapp/whatsapp.routes.ts`.

## Alteração necessária

Se o CRM (Agente 04) precisar disparar WhatsApp para um Lead/Contato a partir do módulo de
prospecção ou do CRM, use a integração real:

```ts
import { sendWhatsAppMessage } from '../../integrations/whatsapp/whatsapp.service.js';

await sendWhatsAppMessage(organizationId, number, text);
```

Funções disponíveis nesse módulo: `initWhatsApp(organizationId)`, `getWhatsAppStatus(organizationId)`,
`logoutWhatsApp(organizationId)`, `sendWhatsAppMessage(organizationId, number, text)`,
`whatsappEvents` (EventEmitter). Ao contrário do serviço órfão removido, esta integração já é
multi-tenant (recebe `organizationId` explicitamente) e usa Baileys (sessão via socket, sem
depender de QR Code lido do stdout do terminal do servidor).

## Teste esperado

- `npx tsc --noEmit` no repositório completo não falha mais por módulo ausente
  (`whatsapp-web.js`/`qrcode-terminal`).
- Nenhum import remanescente de `prospecting/services/whatsapp.service.ts` em `src/` (confirmado
  antes da remoção — ver Resolução).
- Se o Agente 04 implementar disparo de WhatsApp a partir do CRM, o teste esperado é: disparo de
  mensagem a partir de um Lead com número de celular válido via `sendWhatsAppMessage`, respeitando
  o `organizationId` do usuário autenticado (tenancy).

## Contexto adicional

## Resolução (Agente 05, Onda 2)

Decisão: **Opção A** — remoção do arquivo órfão e quebrado, sem reimplementação.

Motivo:
1. `whatsapp-web.js` e `qrcode-terminal` nunca foram instalados neste projeto (confirmado em
   `package.json` e `node_modules`) — o arquivo nunca funcionou em nenhum ambiente real deste
   repositório, só quebrava o typecheck.
2. Antes de remover, confirmei via busca em `src/` (`grep -rn "prospecting/services/whatsapp"` e
   `grep -rln "whatsappService"`) que nenhum outro arquivo do repositório importava essa classe ou
   seu export — o único uso era textual, dentro do handoff antigo `onda-G`, nunca em código.
3. Já existe uma integração de WhatsApp real, funcional e em produção em
   `src/features/integrations/whatsapp/`, usando `@whiskeysockets/baileys` (dependência já presente
   em `package.json`), já multi-tenant e já exposta via `whatsapp.routes.ts`. Reimplementar um
   segundo client de WhatsApp duplicaria essa integração sem necessidade comprovada (violaria a
   regra de Performance/dependências do `AGENTS.md` global — "não adicionar dependência nova sem
   justificar por que a já existente não resolve" — e aqui nem seria dependência nova, seria uma
   segunda integração paralela sem justificativa de sessão dedicada ou rate limit isolado).
4. Nenhuma necessidade de sessão de WhatsApp dedicada para prospecção fria em massa foi identificada
   nesta onda — se isso surgir como requisito de negócio real, deve ser um handoff novo e explícito,
   não a reativação silenciosa deste arquivo morto.

Arquivo removido: `src/features/prospecting/services/whatsapp.service.ts`.

Ação para o Agente 04: nenhuma ação obrigatória por causa desta remoção (nada consumia o arquivo
removido). Se e quando o CRM precisar disparar WhatsApp para um lead qualificado, importe
`sendWhatsAppMessage` de `src/features/integrations/whatsapp/whatsapp.service.ts` conforme o
snippet acima.
