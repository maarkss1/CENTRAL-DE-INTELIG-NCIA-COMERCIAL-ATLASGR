# Mapa de Navegação da Aplicação

Estrutura real do menu lateral (`src/components/layout/Sidebar.tsx` / `tabMeta.ts`), conferida em
26/08/2026 (Roadmap v2, Onda 4). Atualize este arquivo sempre que um módulo for adicionado,
renomeado ou removido do menu — ele é a fonte de verdade textual para quem produz
roteiro/inventário institucional.

A Sidebar não é mais organizada por área técnica ("Core Modules" / "Inteligência" / "Ferramentas").
Desde a reorganização registrada em `Sidebar.tsx`, os grupos seguem a **jornada comercial**
(Captar → Qualificar → Relacionar → Fechar → Analisar), e a ordem dos grupos muda por papel do
usuário (Closer, Gestor/Admin, Visualizador e SDR/padrão têm ordens diferentes — os mesmos grupos,
sem nenhum item escondido por reordenação; só o RBAC dos itens condicionais abaixo esconde item de
verdade).

- **/login** (Tela de Acesso)
- **/app** (Interface Principal Autenticada)
  - **Visão Geral**
    - Painel Central (Dashboard)
  - **Captar**
    - Prospecção
    - Market Intelligence
  - **Qualificar**
    - Empresas
    - Decisores
    - Mesa de Tratamento
    - Matriz de Qualificação
  - **Relacionar**
    - Agenda
    - Calendário
    - Cadência
  - **Fechar**
    - Pipeline CRM
    - Cockpit CRM
    - Propostas
  - **Analisar**
    - Comercial Inteligente — visível apenas para papéis Gestor/Admin (`canAccessCommercialIntelligence`)
    - Analytics
    - Win/Loss
    - Relatórios IA
  - **IA & Capacitação**
    - Hub de IA
    - Chatbook
    - Roleplay (rótulo atual do código; capturas de tela e roteiros mais antigos desta pasta ainda
      chamam o módulo de "Dojo de Vendas" — ver observação abaixo)
    - Matriz de Objeções
    - Academy
    - Base de Conhecimento
    - Editor de Documentos
  - **Administração** — visível a todos os papéis; quatro itens (Integrações, Automações, Consumo
    de IA, Equipe) só aparecem para o papel `ADMIN`
    - Notificações
    - Guia Bitrix24
    - Integrações — só `ADMIN`
    - Automações — só `ADMIN`
    - Consumo de IA — só `ADMIN`
    - Equipe — só `ADMIN`
    - Configurações

## Observações de conteúdo

- **Rótulo "Dojo de Vendas" está desatualizado.** As imagens `imagens/03-modulos/10-dojo-vendas.png`
  e o roteiro `roteiros/roteiro-apresentacao.md`/`roteiro-demonstracao.md` chamam o módulo de
  simulação de vendas por voz de "Dojo de Vendas". No código atual (`tabMeta.ts`), o rótulo exibido
  ao usuário é **"Roleplay"**. Não é uma funcionalidade removida — é o mesmo módulo (`roleplay`,
  ícone `PhoneCall`) com rótulo renomeado em algum ponto depois da última captura de tela. Mantido
  como observação em vez de renomear a imagem/roteiro (fora do escopo de uma auditoria de tokens de
  marca decidir se a imagem deve ser recapturada) — quem produzir uma nova rodada de screenshots
  deve atualizar o nome do arquivo e o texto junto.
- **Não existe mais item "Ferramentas" com link externo na Sidebar.** Uma versão anterior deste
  mapa documentava um grupo "Ferramentas" com "Portal Comercial Bitrix24"
  (`/tools/portal-comercial/index.html`) como link externo fora da SPA. Esse grupo não existe mais
  em `Sidebar.tsx` — `grep` em `src/` não encontra nenhuma referência a `tools/portal-comercial` fora
  dos arquivos de integração Bitrix (`bitrixFieldMap.ts`, `extractionEntities.ts`, que só citam o
  caminho como comentário de referência). O material estático em
  `public/tools/portal-comercial/**` continua existindo no repositório (fora do escopo deste
  diretório — pertence a quem for dono de `public/**`), mas não está mais acessível a partir do menu
  principal. Não recriar esse item aqui como se ainda existisse.
- **Divergência "Cockpit CRM sem rota" já foi corrigida.** Uma observação anterior deste arquivo
  descrevia `crm360` (Cockpit CRM) como item de menu sem `<Route>` correspondente em `src/App.tsx`
  (handoff `.agents/handoffs/onda-4/11-para-02-crm360-rota-ausente.md`, Onda 4 histórica). Conferido
  nesta revisão: `src/App.tsx` já registra `<Route path="crm360" element={<CrmOverview ... />} />` e
  `TAB_ROUTE_SET` em `src/lib/navigationBus.ts` já inclui `crm360: true`. O handoff está com
  `Status: resolvido` e a resolução está documentada nele mesmo — não é mais uma divergência aberta,
  não recriar o alerta em auditorias futuras sem antes checar o código.
- Os identificadores `enrich` e `prompts`, citados numa revisão anterior deste arquivo como "código
  morto sem rota", já foram removidos de `tabMeta.ts` (ver comentário no topo daquele arquivo,
  "removidos por não corresponderem a nenhuma tela real" — Onda 10). Não existem mais como
  `TabType`; não há nada a observar sobre eles hoje.
