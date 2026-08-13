- De: Agente 05 (Prospecção)
- Para: Agente 04 (CRM)
- Onda: G
- Status: resolvido
- Prioridade: alto
## Problema
CRM precisa disparar mensagens do WhatsApp sob demanda para os contatos qualificados.
## Arquivo(s) envolvido(s)
- `src/features/prospecting/services/whatsapp.service.ts`
- Modificações necessárias nas rotas/serviços de CRM.
## Alteração necessária
Utilizar o `whatsappService.sendMessage(to, message)` disponível no módulo de prospecção para enviar mensagens de WhatsApp sob demanda.
## Teste esperado
Disparo de mensagem a partir de um Lead com número de celular válido via WhatsApp.
## Contexto adicional
O serviço `whatsappService` exportado precisa ser inicializado lendo o QR Code no terminal.

## Resolução

**Não implementei literalmente o que este handoff pede.** `src/features/prospecting/services/
whatsapp.service.ts` (o arquivo apontado aqui) está quebrado: importa `whatsapp-web.js` e
`qrcode-terminal`, pacotes que não existem em `package.json`, e `npx tsc --noEmit`/build falham por
causa dele. Além disso, ele duplica uma integração de WhatsApp real e já em produção em
`src/features/integrations/whatsapp/` (usa `@whiskeysockets/baileys`, sessão por tenant/QR via web
— não terminal —, já montada em `server.ts` como `/api/whatsapp/**`). Conectar o CRM ao serviço
quebrado quebraria o gate desta onda e criaria uma segunda fonte de verdade para uma mesma sessão de
WhatsApp por organização.

Em vez disso, implementei o disparo sob demanda do CRM usando a integração real:
- `src/features/crm/components/LeadDetailDrawer.tsx` — novo botão "WhatsApp" que abre
  `WhatsAppChatPanel` (componente já existente em `src/features/integrations/whatsapp/components/`,
  hoje só usado pela Prospecção) com o telefone do lead. O painel resolve status de conexão, histórico
  e envio via `useWhatsAppMessages` → `POST /api/whatsapp/send`, que já é autenticado, tenant-scoped
  (`organizationId` do usuário logado) e trata "WhatsApp não conectado" com erro visível (409) em vez
  de sucesso otimista. Nenhum arquivo de `src/features/integrations/**` foi alterado — reuso puro de
  componente exportado, mesmo padrão já usado neste arquivo para `DecisionMakerSearch` (prospecção).
- Critério de escolha do telefone: `contact.whatsapp || contact.phone || company.phones[0]` — mesma
  ordem já usada pelo copiloto de IA (`AIEmailGenerator`) no mesmo drawer, para não haver dois
  critérios divergentes de "qual telefone é o certo" na mesma tela.

Abri `.agents/handoffs/onda-2/04-para-05-whatsapp-duplicado.md` para você decidir o destino de
`src/features/prospecting/services/whatsapp.service.ts` (remover ou re-arquitetar) — é arquivo do
seu domínio, não apaguei/alterei.
