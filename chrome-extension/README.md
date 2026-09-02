# Copiloto Comercial IA — Extensão Chrome (Onda 2)

Extensão Manifest V3 real (não mais o starter demonstrativo) que fala com o backend do módulo
Copiloto Comercial IA (`src/features/copiloto-ia/`, ver `AGENTS.md` lá) via `/api/copiloto-ia/*`.

## O que esta onda faz

- Detecta o Google Meet (URL + título + código da reunião).
- Vincula a reunião a um Lead existente da Central Atlas GR (o usuário informa o id do Lead —
  busca por nome ainda não existe, é trabalho de uma próxima onda).
- Captura e registra o consentimento (base legal da gravação, auditável em `AuditLog` via
  `COPILOTO_IA_CONSENT`).
- Controla o CICLO da sessão de captura (`SCHEDULED → CAPTURING → PROCESSING → READY/...`) no
  backend, com indicador visual persistente na própria página do Meet enquanto ativa.

## O que esta onda NÃO faz (de propósito)

- **Não grava áudio real.** "Iniciar sessão de captura" só abre o registro `CAPTURING` no backend
  — não há `tabCapture`/`getDisplayMedia` nesta extensão ainda. Transcrição real é a próxima onda
  do roadmap (`docs/ROADMAP_MVP.md` do pacote `atlasgr_copiloto_ai_pack`, Onda 3).
- **Não fala com o Bitrix24.** Só chama o backend da Central — quem fala com o Bitrix é o backend
  (ver `docs/BITRIX_FIELD_MAPPING.md`/`AGENT_08_BITRIX24.md` do pacote, ainda não implementado).
- **Não guarda segredo nenhum.** Autenticação é a sessão de navegador já aberta na Central Atlas GR
  (cookie do Better Auth, enviado via `credentials: 'include'`) — sem token/API key na extensão.

## Como testar localmente

1. Suba o backend local (`npm run dev` na raiz do repo — porta padrão `3005`).
2. Faça login na Central Atlas GR numa aba normal do MESMO perfil do Chrome (a extensão reaproveita
   essa sessão via cookie).
3. `chrome://extensions` → ative o "Modo do desenvolvedor" → "Carregar sem compactação" → selecione
   esta pasta (`chrome-extension/`).
4. Abra uma chamada em `meet.google.com`, clique no ícone da extensão para abrir o side panel.
5. Informe o id de um Lead existente da sua organização e clique em "Vincular reunião a este Lead".
6. Marque o consentimento, clique em "Registrar consentimento", depois em "Iniciar sessão de
   captura" — o pill de status muda para "Capturando" e aparece o indicador vermelho no topo da
   página do Meet.

## Deploy em produção — passos pendentes (não automatizáveis por código)

1. **CORS**: adicione a origem da extensão (`chrome-extension://<id>`) à variável de ambiente
   `ALLOWED_ORIGINS` do backend (`src/bootstrap/security.ts` só libera qualquer origem fora de
   produção). O `<id>` só é estável entre reinstalações se a extensão for publicada com uma chave
   fixa (`key` no manifest) ou distribuída via política empresarial do Google Workspace.
2. **URL do backend**: na aba "Configurações" do side panel, troque a URL padrão
   (`http://localhost:3005`) pelo domínio real de produção — a extensão pede a permissão de host
   correspondente (`optional_host_permissions`) na hora, nunca de antemão.
3. **Distribuição**: para um time inteiro, prefira publicação privada na Chrome Web Store ou
   instalação forçada via política do Google Workspace ("Carregar sem compactação" é só para
   desenvolvimento/teste).

## Estrutura

```
chrome-extension/
├── manifest.json
└── src/
    ├── background.js   # service worker — só roteia mensagens content<->sidepanel
    ├── content.js      # detecta o Meet, mostra o indicador persistente de captura
    ├── api.js           # cliente HTTP do backend (sem segredos)
    ├── sidepanel.html/.css/.js  # UI principal
```
