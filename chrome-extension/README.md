# Copiloto Comercial IA — Extensão Chrome (Onda 2 + Onda 3)

Extensão Manifest V3 real que fala com o backend do módulo Copiloto Comercial IA
(`src/features/copiloto-ia/`, ver `AGENTS.md` lá) via `/api/copiloto-ia/*`.

## O que já faz

- Detecta o Google Meet (URL + título + código da reunião).
- Vincula a reunião a um Lead existente da Central Atlas GR — por nome (busca incremental com
  `GET /api/copiloto-ia/leads/search`, mostrando até 10 candidatos por título do Lead/nome do
  Contato/razão social ou nome fantasia da Company), por e-mail do contato, por link de
  lead/negócio do Bitrix24, ou colando o id cru da Central (`GET /api/copiloto-ia/leads/lookup`,
  resolve para no máximo um resultado exato).
- Captura e registra o consentimento (base legal da gravação, auditável em `AuditLog` via
  `COPILOTO_IA_CONSENT`).
- **Grava o áudio real da aba do Meet** (Onda 3) — só depois de "Iniciar sessão de captura", nunca
  antes, nunca sem o clique explícito do usuário. Usa `chrome.tabCapture` + um documento offscreen
  (`src/offscreen.js`, único contexto de extensão com `MediaRecorder`) e reencaminha o áudio pro
  alto-falante (`<audio autoplay>`) pra o usuário não perder o som da própria reunião enquanto grava.
- Ao parar a captura, sobe o áudio gravado direto pro storage S3-compatível do backend (URL
  assinada, `getUploadUrl`/`src/lib/storage`) e avisa o backend, que enfileira a transcrição
  (Whisper) e o resumo executivo em segundo plano — ver
  `src/features/copiloto-ia/jobs/transcribeConversation.worker.ts`.
- Indicador visual persistente na própria página do Meet enquanto a captura está ativa (content
  script) — o usuário não precisa manter o side panel aberto pra saber que está gravando.

## O que ainda NÃO faz (de propósito)

- **Não fala com o Bitrix24.** Só chama o backend da Central — quem fala com o Bitrix é o backend
  (mapeamento de campo + writeback real para `entityType: LEAD`, com aprovação humana, já
  implementado na Onda 4 — ver `bitrix-field-mappings`/`crm-field-suggestions/:id/writeback` em
  `routes/copilotoIa.routes.ts` e `AGENT_08_BITRIX24.md`/`docs/BITRIX_FIELD_MAPPING.md` do pacote).
- **Não guarda segredo nenhum.** Autenticação é a sessão de navegador já aberta na Central Atlas GR
  (cookie do Better Auth, enviado via `credentials: 'include'`) — sem token/API key na extensão. A
  chave da OpenAI (Whisper) fica só no backend, nunca chega ao navegador.

## Como testar localmente

1. Suba o backend local (`npm run dev` na raiz do repo — porta padrão `3005`) e o worker de filas
   (`npm run worker`, ou `ENABLE_EMBEDDED_WORKERS=true` no `.env` do servidor) — sem um dos dois
   rodando, a transcrição fica enfileirada mas nunca processa.
2. Configure `OPENAI_API_KEY` e as variáveis `STORAGE_*` (`.env.example` documenta as duas) — sem
   elas, o upload de áudio ou a transcrição falham explicitamente (nunca silenciosamente).
3. Faça login na Central Atlas GR numa aba normal do MESMO perfil do Chrome (a extensão reaproveita
   essa sessão via cookie).
4. `chrome://extensions` → ative o "Modo do desenvolvedor" → "Carregar sem compactação" → selecione
   esta pasta (`chrome-extension/`).
5. Abra uma chamada em `meet.google.com`, clique no ícone da extensão para abrir o side panel.
6. Informe o id de um Lead existente da sua organização e clique em "Vincular reunião a este Lead".
7. Marque o consentimento, clique em "Registrar consentimento", depois em "Iniciar sessão de
   captura" — o Chrome pede confirmação de captura de aba (comportamento padrão do
   `chrome.tabCapture`), o pill de status muda para "Capturando" e aparece o indicador vermelho no
   topo da página do Meet.
8. Clique em "Parar sessão de captura" — o botão mostra "Enviando gravação..." até o upload
   terminar. A partir daí, a transcrição e o resumo rodam em background; acompanhe via
   `GET /api/copiloto-ia/conversations/:id` (`transcriptSegments`/`insights`) ou direto no banco.

**Verificação real ainda pendente**: esta implementação segue a documentação oficial do Chrome
(`chrome.tabCapture` + `chrome.offscreen` + `MediaRecorder`), mas nunca foi exercitada numa chamada
real do Google Meet — precisa de um passo manual num Chrome de verdade antes de confiar em produção.

## Deploy em produção — passos pendentes (não automatizáveis por código)

1. **CORS**: adicione a origem da extensão (`chrome-extension://<id>`) à variável de ambiente
   `ALLOWED_ORIGINS` do backend (`src/bootstrap/security.ts` só libera qualquer origem fora de
   produção). O `<id>` só é estável entre reinstalações se a extensão for publicada com uma chave
   fixa (`key` no manifest) ou distribuída via política empresarial do Google Workspace.
2. **URL do backend**: na aba "Configurações" do side panel, troque a URL padrão
   (`http://localhost:3005`) pelo domínio real de produção — a extensão pede a permissão de host
   correspondente (`optional_host_permissions`) na hora, nunca de antemão.
3. **Storage e Whisper configurados** — sem `STORAGE_*`/`OPENAI_API_KEY` reais em produção, o botão
   de captura ainda funciona (grava localmente), mas o upload/transcrição falham com erro explícito.
4. **Distribuição**: para um time inteiro, prefira publicação privada na Chrome Web Store ou
   instalação forçada via política do Google Workspace ("Carregar sem compactação" é só para
   desenvolvimento/teste).

## Estrutura

```
chrome-extension/
├── manifest.json
└── src/
    ├── background.js         # service worker — orquestra offscreen/tabCapture, roteia mensagens
    ├── content.js             # detecta o Meet, mostra o indicador persistente de captura
    ├── offscreen.html/.js     # grava o áudio de verdade (MediaRecorder) e sobe pro storage
    ├── api.js                 # cliente HTTP do backend (sem segredos)
    ├── sidepanel.html/.css/.js  # UI principal
```
