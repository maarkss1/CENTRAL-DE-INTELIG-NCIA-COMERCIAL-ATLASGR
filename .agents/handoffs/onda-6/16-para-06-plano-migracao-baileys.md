- De: Agente 16 (Runtime, Workers e Escala)
- Para: Agente 06 (Integrações e Bitrix — dono de `src/features/integrations/whatsapp/**`)
- Onda: 6
- Status: aberto
- Prioridade: alto (não bloqueia esta onda — é plano para coordenação futura, sessões Baileys
  explicitamente NÃO movidas nesta execução, conforme instrução do meu prompt)

## Problema
As sessões Baileys (WhatsApp Web) vivem em memória no processo HTTP (`server.ts` → rotas em
`src/features/integrations/whatsapp/whatsapp.routes.js`). Isso significa:
- qualquer restart do processo HTTP (deploy, crash, scale) derruba a sessão de WhatsApp pareada,
  exigindo novo QR code;
- múltiplas réplicas do processo HTTP não podem compartilhar a mesma sessão — cada réplica teria
  seu próprio estado, quebrando o pareamento single-session do WhatsApp Web;
- movida para o processo `worker.ts` (novo entrypoint desta onda), a sessão sobrevive a deploys do
  serviço HTTP e fica isolada do event loop que serve requisição de usuário.

Esta é a parte de **maior risco** da separação de runtime: se o pareamento quebrar em produção, a
integração de WhatsApp inteira para (mensagens não chegam, follow-ups automáticos não disparam).
Não movi nada nesta onda — só o plano abaixo, para acordo por escrito antes de qualquer execução.

## Arquivo(s) envolvido(s)
`src/features/integrations/whatsapp/**` (propriedade do Agente 06 — não toquei)

## Alteração necessária (plano proposto, não implementado)
1. **Levantamento prévio** (Agente 06 confirma): onde exatamente a sessão Baileys vive hoje em
   memória — um `Map<organizationId, WASocket>` module-level, ou algo persistido em disco/banco
   entre reconexões? Preciso saber a forma de persistência de credenciais (`auth_info_baileys` ou
   equivalente) para saber se ela já sobrevive a um restart do processo ou não.
2. **Mover a criação/gestão da sessão para `worker.ts`**: a conexão Baileys (WebSocket para o
   WhatsApp) passa a ser estabelecida e mantida no processo worker, não no processo HTTP.
3. **Contrato de consulta do processo HTTP → estado da sessão**: hoje as rotas HTTP
   (`whatsapp.routes.js`) provavelmente leem o objeto de sessão diretamente da memória do mesmo
   processo. Com a sessão vivendo no worker, o processo HTTP precisa de um canal para:
   - consultar status da sessão (conectada/desconectada/aguardando QR);
   - obter o QR code atual durante o pareamento;
   - **enviar mensagens** (hoje provavelmente uma chamada direta ao socket Baileys em memória).
   Duas opções de contrato, a decidir com o Agente 06:
   - (a) BullMQ: o processo HTTP enfileira uma "intenção" (`send-message`, `get-qr`,
     `get-status`) numa fila dedicada e o worker responde por um canal de resultado (job
     result/pub-sub Redis) — assíncrono, mas alinhado ao padrão já usado por todas as outras 14
     filas deste repositório.
   - (b) Redis pub/sub direto ou uma pequena API HTTP interna do processo worker (o
     `worker.ts` já expõe um `http.Server` de health check — poderia crescer para isso, mas isso
     tornaria o "entrypoint sem Express" do prompt desta onda menos verdadeiro; prefiro (a) por
     consistência, mas a decisão final depende de quão latência-sensível é o fluxo de pareamento
     por QR code, que o Agente 06 conhece melhor).
4. **Persistência de sessão**: confirmar que a store de credenciais Baileys (arquivo ou banco) não
   depende de estar no mesmo processo/filesystem que o processo HTTP — se depender de disco local
   efêmero, isso precisa de um volume persistente compartilhado ou migração para uma store
   Postgres/Redis antes de qualquer separação de processo ser segura em produção (réplicas podem
   rodar em containers/hosts diferentes).
5. **Rollout**: propor rodar em paralelo (feature flag) por um período — sessão nova pareada pelo
   worker, sessões antigas ainda geridas pelo processo HTTP até expirarem — em vez de corte
   abrupto, dado o risco de reconexão falhar silenciosamente.

## Teste esperado
- QR code pareado com sucesso, mensagem enviada e recebida, processo HTTP reiniciado sem derrubar
  a sessão do worker, worker reiniciado sem duplicar sessão.

## Contexto adicional
Nenhuma linha de `src/features/integrations/whatsapp/**` foi alterada nesta execução — este handoff
é só o plano solicitado pelo meu prompt ("documente apenas o plano detalhado como handoff para
coordenação futura com o 06"). Aguardo confirmação do Agente 06 sobre o formato de persistência
atual antes de qualquer execução.
