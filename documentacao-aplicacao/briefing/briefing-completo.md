# Briefing Completo da Aplicação

## 1. Resumo executivo
(Consultar o documento *resumo-executivo.md* incluído na pasta).

## 2. Objetivo da plataforma
A plataforma visa atuar como um sistema central para times de vendas B2B (SDRs, Executivos, Gestores), consolidando em um único lugar a busca por novos leads, o acompanhamento do funil de vendas, a agenda de interações e o auxílio de IA generativa para treinamento e análise de dados.

## 3. Estrutura da navegação
A aplicação conta com um Menu Principal (Sidebar lateral) organizado pela jornada comercial
(conferido contra `src/components/layout/Sidebar.tsx` em 26/08/2026 — ver detalhamento completo,
incluindo observações de divergência já corrigidas, em `/inventario/mapa-de-navegacao.md`):
- **Visão Geral:** Painel Central (Dashboard).
- **Captar:** Prospecção, Market Intelligence.
- **Qualificar:** Empresas, Decisores, Mesa de Tratamento, Matriz de Qualificação.
- **Relacionar:** Agenda, Calendário, Cadência.
- **Fechar:** Pipeline CRM, Cockpit CRM, Propostas.
- **Analisar:** Comercial Inteligente (só Gestor/Admin), Analytics, Win/Loss, Relatórios IA.
- **IA & Capacitação:** Hub de IA, Chatbook, Roleplay, Matriz de Objeções, Academy, Base de Conhecimento, Editor de Documentos.
- **Administração:** Notificações, Guia Bitrix24 e Configurações (todos os papéis); Integrações, Automações, Consumo de IA e Equipe (só papel `ADMIN`).

A ordem dos grupos acima muda por papel do usuário (Closer, Gestor/Admin, Visualizador e SDR/padrão
têm prioridades diferentes de jornada), mas os grupos e itens são os mesmos — nenhum item some por
reordenação, só pelo RBAC já indicado acima. O antigo grupo "Ferramentas" (link externo para o
Portal Comercial Bitrix24) não existe mais no menu principal — ver observação em
`/inventario/mapa-de-navegacao.md`.

Há também configurações globais como alternância de temas, comandos de voz e um chat bot persistente flutuante.

## 4. Inventário de telas
Não existe hoje uma planilha CSV de inventário de telas nesta pasta (`/inventario/` contém apenas
`mapa-de-navegacao.md`). Uma versão anterior deste briefing apontava para
`/inventario/inventario-de-telas.csv`, que nunca chegou a ser produzida — corrigido nesta revisão
para não prometer um arquivo inexistente. Até que essa planilha seja produzida, use
`/inventario/mapa-de-navegacao.md` (a lista completa de módulos por grupo) como inventário textual
equivalente.

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
Não existe um arquivo `roadmap.md` nesta pasta hoje — uma versão anterior deste briefing apontava
para ele, mas o arquivo nunca foi produzido. Corrigido nesta revisão para não prometer um documento
inexistente. Para prioridades de produto reais e já registradas, ver
`AUTONOMIA_COMERCIAL_24X7.md`/`PRODUCT_EXPERIENCE_CENTRAL_ATLASGR.md` na raiz do repositório (fora
desta pasta) e `atualizacoes-futuras.md` (item 10 acima), que já cobre sugestões pontuais por
módulo.

## 12. Arquivos produzidos
- `/briefing/` (briefing-completo.md, resumo-executivo.md, atualizacoes-futuras.md — não existe
  `roadmap.md` nesta pasta, ver item 11 acima)
- `/imagens/` (Categorias 01 a 06 com imagens da plataforma — capturadas antes da reorganização da
  Sidebar por jornada comercial registrada no item 3; refletem a estrutura de menu anterior
  "Core Modules/Inteligência", não a atual. Recomenda-se recapturar numa próxima rodada com acesso a
  ambiente autenticado real.)
- `/videos/` (apresentacao-completa.mp4 — único vídeo gravado hoje; `roteiro-apresentacao.md` e
  `roteiro-demonstracao.md` referenciam este mesmo material bruto até que uma gravação dedicada ao
  roteiro de demonstração de fluxos exista — ver nota nos próprios roteiros)
- `/roteiros/` (roteiro-apresentacao.md, roteiro-demonstracao.md)
- `/inventario/` (mapa-de-navegacao.md — não existe `inventario-de-telas.csv` nesta pasta, ver item
  4 acima)
