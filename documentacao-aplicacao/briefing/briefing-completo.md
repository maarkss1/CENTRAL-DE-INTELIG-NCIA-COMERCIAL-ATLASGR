# 1. Resumo executivo

O Prospector AtlasGR é uma plataforma comercial avançada de CRM e Inteligência B2B, desenhada para centralizar a operação comercial, desde a prospecção autônoma até o fechamento de vendas. A aplicação oferece um ambiente moderno e responsivo, focado em metodologias comprovadas (SPIN, SNAP, MEDDPICC), com recursos de rastreamento de inteligência e suporte de assistentes de IA (Roleplay e Web Agent). O principal benefício é a unificação de todas as etapas do funil de vendas em uma interface fluida, garantindo que o time comercial acompanhe contatos, empresas, agendas e o pipeline de forma organizada e eficiente.

# 2. Objetivo da plataforma

A plataforma tem como objetivo centralizar e otimizar o processo de vendas e prospecção de ponta a ponta. Ela atende a necessidade de times comerciais de terem uma ferramenta única para gerenciar a entrada de novos leads, qualificação via metodologias consolidadas, acompanhamento no Kanban (CRM) e agendamento de atividades, tudo integrado com recursos de enriquecimento de dados e inteligência artificial para maximizar a conversão.

# 3. Estrutura da navegação

*   **Página Inicial (Dashboard):** Visão geral da plataforma, seleção de operações (AtlasGR ou TotalTrac) e configurações de IA.
*   **Menu Principal (Header):**
    *   Prospecção
    *   CRM (Kanban)
    *   Metodologias (SPIN/SNAP/MEDDPICC)
    *   Empresas
    *   Contatos
    *   Agenda
    *   Roleplay & Objeções
*   **Área Superior Direita:**
    *   Alternador de Tema (Claro/Escuro)
    *   Menu do Usuário (Perfil, Troca de Conta)
*   **Recursos Flutuantes (Bottom Right):**
    *   Comando de Voz
    *   Assistente Atlas AI & Web Agent

# 4. Inventário de telas

| Nº | Tela | Módulo | Finalidade | Recursos presentes | Arquivo da imagem |
|---|---|---|---|---|---|
| 01 | Login | Acesso | Autenticação de usuários | Login social (Google/Microsoft), Login Rápido (Dev) | 01-login.png |
| 02 | Dashboard Principal | Dashboard | Visão geral e seleção de módulos | Cards de operações (AtlasGR, TotalTrac), Acesso rápido | 01-dashboard-principal.png |
| 03 | Prospecção | Prospecção | Busca e gestão de leads | Filtros, lista de leads, importação | 01-prospeccao.png |
| 04 | CRM | CRM | Gestão visual de oportunidades | Quadro Kanban, cards de negócios, pipeline | 02-crm.png |
| 05 | Metodologias | Inteligência | Qualificação avançada de leads | Frameworks SPIN, SNAP, MEDDPICC | 03-metodologias.png |
| 06 | Empresas | Cadastros | Gestão da base de empresas | Tabela de empresas, pesquisa, filtros | 01-empresas.png |
| 07 | Contatos | Cadastros | Gestão da base de pessoas | Tabela de contatos, pesquisa, detalhes | 02-contatos.png |
| 08 | Agenda | Relatórios/Agenda | Acompanhamento de atividades | Calendário/Lista de tarefas, reuniões | 01-agenda.png |
| 09 | Roleplay & Objeções | Inteligência | Treinamento de vendas com IA | Chatbot de simulação, análise de objeções | 04-roleplay.png |
| 10 | Menu do Usuário | Configurações | Ações de conta e perfil | Perfil atual, troca rápida de contas | 01-menu-usuario.png |

# 5. Descrição dos módulos

*   **Prospecção:**
    *   **Objetivo:** Captar e qualificar novos leads.
    *   **Público:** SDRs e Executivos de Vendas.
    *   **Informações/Funcionalidades:** Busca de contatos, enriquecimento de e-mails, adição rápida ao CRM.
    *   **Benefício:** Reduz o tempo gasto em pesquisas manuais, automatizando a entrada de dados.
*   **CRM (Kanban):**
    *   **Objetivo:** Gerenciar o funil de vendas.
    *   **Público:** Executivos de Vendas e Gestores.
    *   **Informações/Funcionalidades:** Colunas customizáveis, arraste e solte (drag and drop) de cards, valor de pipeline.
    *   **Benefício:** Visualização clara de onde cada negócio está e quais ações são necessárias para avançar.
*   **Metodologias:**
    *   **Objetivo:** Aplicar frameworks de vendas complexas.
    *   **Público:** Executivos de Vendas.
    *   **Informações/Funcionalidades:** Guias estruturados para SPIN Selling, SNAP e MEDDPICC.
    *   **Benefício:** Aumenta a taxa de fechamento por meio de uma abordagem científica de vendas.
*   **Empresas & Contatos (Cadastros):**
    *   **Objetivo:** Centralizar o Master Data Management (MDM).
    *   **Público:** Toda a equipe comercial.
    *   **Informações/Funcionalidades:** Listagem detalhada, histórico e dados corporativos.
    *   **Benefício:** Garante a consistência dos dados, evitando duplicidades.
*   **Agenda:**
    *   **Objetivo:** Organizar tarefas e follow-ups.
    *   **Público:** Toda a equipe.
    *   **Informações/Funcionalidades:** Registro de ligações, e-mails, reuniões e lembretes.
    *   **Benefício:** Evita a perda de oportunidades por esquecimento de follow-up.
*   **Roleplay & Objeções:**
    *   **Objetivo:** Treinamento contínuo de vendas.
    *   **Público:** SDRs e Executivos em ramp-up.
    *   **Informações/Funcionalidades:** Interação com IA para simular ligações e rebater objeções.
    *   **Benefício:** Acelera o tempo de treinamento (onboarding) de novos vendedores.

# 6. Fluxos existentes

1.  **Acesso e Seleção de Operação:**
    1.  Acesso à tela de Login.
    2.  Autenticação (via credenciais ou Dev Login).
    3.  Acesso ao Dashboard Principal.
    4.  Seleção da Operação (Ex: AtlasGR).
    5.  Navegação liberada para os módulos internos.
2.  **Gestão do Funil (CRM):**
    1.  Navegação para o módulo CRM.
    2.  Visualização do pipeline em formato Kanban.
    3.  Consulta rápida de informações do card.
3.  **Prospecção de Novos Clientes:**
    1.  Navegação para o módulo de Prospecção.
    2.  Utilização de filtros de busca.
    3.  Visualização da lista de resultados.

# 7. Componentes encontrados

*   Botões com efeitos de hover e degradês.
*   Cards interativos e modais de apresentação.
*   Menus suspensos (dropdowns) no perfil do usuário.
*   Quadros Kanban (Drag and Drop).
*   Tabelas de dados com paginação e pesquisa.
*   Campos de formulário e filtros avançados.
*   Indicadores visuais (badges, avatares, status de cor).
*   Botões flutuantes para IA e Comando de Voz.
*   Skeleton screens para carregamento suave (Suspense/Lazy loading).

# 8. Conteúdo e dados apresentados

*   Indicadores de Pipeline: Contagem de empresas, contatos, leads ativos.
*   Métricas Financeiras: Valor total no pipeline e taxa de conversão esperada.
*   Categorias de Negócios: Etapas de funil customizadas (Prospecção, Qualificação, Proposta, etc.).
*   Status de Atividades: Tarefas pendentes, concluídas ou em atraso.
*   Informações Operacionais: Estrutura de times e permissões (Admin/Usuário).

# 9. Experiência atual

A aplicação oferece uma experiência altamente imersiva, caracterizada por um design moderno, tema escuro elegante (com suporte a modo claro) e transições suaves. A organização em "Single Page Application" com abas permite uma alternância muito rápida entre módulos, garantindo foco e agilidade. A presença da IA como assistente constante eleva a produtividade, enquanto a centralização de todas as ferramentas de CRM num único painel demonstra um alto valor agregado aos times de receita.

# 10. Atualizações futuras

| Atualização futura | Benefício | Impacto esperado | Prioridade | Complexidade | Área relacionada |
|---|---|---|---|---|---|
| Em uma atualização futura, poderá ser incorporado um módulo de relatórios avançados (BI). | Permitirá análises preditivas mais profundas. | Otimização de previsibilidade de vendas. | Alta | Avançada | Relatórios / Dashboard |
| Como evolução da plataforma, poderá ser adicionado suporte a multi-idiomas. | Expandirá o mercado endereçável da ferramenta. | Facilitação da adoção global. | Média | Moderada | Configurações / Interface |
| Uma próxima versão poderá oferecer integração direta com plataformas de WhatsApp. | Centralizará o histórico de conversas diretas no CRM. | Maior retenção de contexto nas negociações. | Alta | Avançada | Contatos / CRM |
| Existe a oportunidade de ampliar este recurso com exportação PDF das metodologias. | Facilitará o compartilhamento de briefings pré-reunião. | Melhoria na comunicação entre times. | Baixa | Simples | Metodologias |

# 11. Sugestão de roadmap

## Próximo ciclo
*   Integração e sincronização bidirecional de calendário (Google/Outlook) no módulo de Agenda.
*   Exportação de relatórios em CSV/Excel.

## Médio prazo
*   Aplicativo móvel complementar para gestores aprovarem propostas.
*   Painéis de dashboard personalizáveis por usuário (drag and drop de widgets).

## Evolução estratégica
*   Hub de integrações abertas via Zapier/Make.
*   Módulo avançado de Business Intelligence preditivo utilizando o histórico de dados do CRM.

# 12. Arquivos produzidos

*   Documento de briefing (briefing-completo.md).
*   Resumo executivo (resumo-executivo.md).
*   Lista de atualizações futuras (atualizacoes-futuras.md).
*   Mapa de navegação (mapa-de-navegacao.md).
*   Roadmap sugerido (roadmap.md).
*   Imagens capturadas (Diretórios 01 a 06).
*   Vídeos gravados (apresentacao-completa.mp4, demonstracao-dos-fluxos.mp4).
*   Roteiros de apresentação.
*   Inventário de telas (inventario-de-telas.csv).
