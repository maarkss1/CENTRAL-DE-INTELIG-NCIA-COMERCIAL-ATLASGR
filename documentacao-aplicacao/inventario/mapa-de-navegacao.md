# Mapa de Navegação da Aplicação

Estrutura real do menu lateral (`src/components/layout/Sidebar.tsx` / `tabMeta.ts`), conferida em
14/08/2026. Atualize este arquivo sempre que um módulo for adicionado, renomeado ou removido do
menu — ele é a fonte de verdade textual para quem produz roteiro/inventário institucional.

- **/login** (Tela de Acesso)
- **/app** (Interface Principal Autenticada)
  - **Core Modules**
    - Painel Central (Dashboard)
    - Prospecção
    - Pipeline CRM
    - Cockpit CRM
    - Decisores
    - Empresas
    - Agenda
    - Analytics
    - Win/Loss
    - Calendário
    - Notificações
    - Configurações
  - **Executivo** — visível apenas para papéis Gestor/Admin (`canAccessCommercialIntelligence`)
    - Comercial Inteligente
  - **Inteligência**
    - Roleplay (nome de produto: "Dojo de Vendas")
    - Matriz de Qualificação
    - Matriz de Objeções
    - Chatbook
    - Hub de IA
    - Market Intelligence
    - Academy
    - Guia Bitrix24
    - Integrações
    - Relatórios IA
    - Base de Conhecimento
    - Editor de Documentos
    - Automações
    - Consumo de IA
  - **Ferramentas** — link externo, fora da SPA
    - Portal Comercial Bitrix24 (`/tools/portal-comercial/index.html`, abre em nova aba — portal
      multi-página com Home, Cockpit Executivo, Extrator, Forecast Semanal e SDR; substitui o
      antigo `extrator-bitrix.html` de página única)
  - **Administração** — visível apenas para papel administrativo
    - Equipe

## Observação — divergência conhecida (ver handoff)

Ao conferir este mapa contra `src/App.tsx`, `Sidebar.tsx` e `tabMeta.ts` (14/08/2026), encontramos
um item do menu sem rota correspondente: **Cockpit CRM (`crm360`)** aparece em `coreTools`
(Sidebar) e em `TAB_META`, mas não existe `<Route path="crm360">` dentro de `/app/*` em
`src/App.tsx` — o clique cai no catch-all (`path="*"`) e redireciona de volta ao Dashboard sem
aviso. Registrado em `.agents/handoffs/onda-4/11-para-02-crm360-rota-ausente.md` (Agente 02, dono
de `src/App.tsx`/Sidebar) em vez de corrigido aqui, pois está fora do escopo deste diretório.

Os identificadores `enrich` (rótulo "Enriquecer") e `prompts` (rótulo "Commercial OS") têm entrada
em `TAB_META` (`tabMeta.ts`) só porque o tipo `Record<TabType, ...>` exige uma entrada para cada
`TabType` — mas nenhum dos dois tem item de menu na Sidebar nem `<Route>` em `src/App.tsx`; não são
alcançáveis pelo usuário hoje. Não os trate como módulos existentes ao escrever roteiro/briefing.
