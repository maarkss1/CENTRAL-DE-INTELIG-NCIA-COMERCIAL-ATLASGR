# Briefing Completo da Aplicação

## 1. Resumo executivo
(Consultar o documento *resumo-executivo.md* incluído na pasta).

## 2. Objetivo da plataforma
A plataforma visa atuar como um sistema central para times de vendas B2B (SDRs, Executivos, Gestores), consolidando em um único lugar a busca por novos leads, o acompanhamento do funil de vendas, a agenda de interações e o auxílio de IA generativa para treinamento e análise de dados.

## 3. Estrutura da navegação
A aplicação conta com um Menu Principal (Sidebar lateral) segmentado da seguinte forma (conferido
contra `src/components/layout/Sidebar.tsx` em 14/08/2026 — ver detalhamento completo em
`/inventario/mapa-de-navegacao.md`):
- **Core Modules:** Painel Central (Dashboard), Prospecção, Pipeline CRM, Cockpit CRM, Decisores, Empresas, Agenda, Analytics, Win/Loss, Calendário, Notificações, Configurações.
- **Executivo** (só Gestor/Admin): Comercial Inteligente.
- **Inteligência:** Roleplay ("Dojo de Vendas"), Matriz de Qualificação, Matriz de Objeções, Chatbook, Hub de IA, Market Intelligence, Academy, Bitrix24 (Integração), Integrações, Relatórios IA, Base de Conhecimento, Editor de Documentos, Automações, Consumo de IA.
- **Ferramentas:** Extrator Bitrix24 (link externo, fora da SPA).
- **Administração** (só papel administrativo): Equipe.
Há também configurações globais como alternância de temas, comandos de voz e um chat bot persistente flutuante.

## 4. Inventário de telas
(Consultar a planilha CSV em `/inventario/inventario-de-telas.csv`).

## 5. Descrição dos módulos
- **Painel Central (Dashboard):** Objetivo: Visão gerencial. Público: Toda a equipe. Apresenta: KPIs, próximos compromissos e gráficos. Conecta-se diretamente com Agenda e Analytics.
- **Pipeline CRM:** Objetivo: Gestão de negócios. Público: Vendedores e Gestores. Apresenta: Oportunidades em formato Kanban. Ações: Mover cards, atualizar status.
- **Hub de Inteligência (IA):** Objetivo: Apoio cognitivo ao processo de vendas. Público: Toda a equipe. Funcionalidades: Enriquecimento de dados, dojo de treinamento via voz (simulador), geração automática de resumos.

## 6. Fluxos existentes
**1. Login e acesso:**
   1. Usuário acessa a página inicial.
   2. Insere e-mail corporativo (ou utiliza Google Sign-In).
   3. Acessa o painel central autenticado.

**2. Acompanhamento de indicadores:**
   1. Usuário navega para o Dashboard ou aba Analytics.
   2. Visualiza a evolução mensal.
   3. Interage com componentes gráficos para detalhamento.

**3. Navegação via Comando de Voz:**
   1. Usuário clica no widget de microfone no canto inferior da tela.
   2. IA processa a solicitação e pode direcionar o usuário para a página de interesse.

## 7. Componentes encontrados
- **Botões:** Interativos, com efeitos visuais *glow* e de pressão (*active:scale*).
- **Cards e Gráficos:** Estilização limpa (Glassmorphism), sombras sutis, adequados ao tema escuro.
- **Menús e Abas:** Sidebar esquerdo colapsável, navegação rápida via topo.
- **Widgets Flutuantes:** Comando por voz e Copilot fixados globalmente.
- **Alertas e Modais:** Feedbacks via sistema de *Toaster* (Toast notifications).

## 8. Conteúdo e dados apresentados
- **Indicadores:** Taxa de conversão, leads processados.
- **Relatórios:** Evolução de atividades e metas alcançadas.
- **Dados Operacionais:** Informações organizadas em tabelas para decisores e empresas (nome, email, telefone).

## 9. Experiência atual
A aplicação oferece uma navegação extremamente rápida, de fácil aprendizado e com um aspecto visual primoroso. A organização centraliza de modo eficiente as rotinas diárias e as tarefas que demandam mais esforço cognitivo são apoiadas de maneira criativa por ferramentas de inteligência artificial interativas. É um ambiente desenhado para alta produtividade.

## 10. Atualizações futuras
(Consultar *atualizacoes-futuras.md*).

## 11. Sugestão de roadmap
(Consultar *roadmap.md*).

## 12. Arquivos produzidos
- `/briefing/` (briefing-completo.md, resumo-executivo.md, atualizacoes-futuras.md, roadmap.md)
- `/imagens/` (Categorias 01 a 06 com imagens da plataforma)
- `/videos/` (apresentacao-completa.mp4, demonstracao-dos-fluxos.mp4)
- `/roteiros/` (roteiro-apresentacao.md, roteiro-demonstracao.md)
- `/inventario/` (inventario-de-telas.csv, mapa-de-navegacao.md)
