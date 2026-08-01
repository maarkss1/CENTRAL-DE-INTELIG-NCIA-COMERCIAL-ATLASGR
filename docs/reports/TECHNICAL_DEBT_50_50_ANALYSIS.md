# Análise Completa e Robusta de Dívida Técnica e Roadmap de Produto

Este documento consolida uma auditoria estrutural do projeto PROSPECTOR-ATLAS. Ele é dividido em duas grandes seções: **50 Itens de Melhorias (Dívida Técnica/Refatoração)** em processos já existentes, e **50 Novos Itens (Roadmap/Funcionalidades)** que devem ser implementados para elevar a plataforma a um padrão Enterprise B2B SaaS.

---

## Parte 1: 50 Itens de Melhorias no que Já Existe (Dívida Técnica e Refatoração)

### Arquitetura de Código e Padrões (Clean Architecture)
1. **Tipagens `any` e Type Safety:** Remover supressões de TypeScript (`@ts-ignore`) e tipos `any` que ainda existem na camada de `services` (ex: Prisma queries dinâmicas). Utilizar `Prisma.Args` corretamente.
2. **Separação Estrita de Responsabilidades:** Garantir que Controllers nunca contenham lógica de negócios, delegando 100% aos UseCases.
3. **Injeção de Dependência:** Uniformizar o uso do manual container (`src/shared/di/container.ts`) para todos os UseCases e Services, eliminando acoplamento direto de classes.
4. **Padronização de Retorno de API:** Criar um padrão único de Response (ex: `SuccessResponse` e `ErrorResponse`) para todas as rotas do Express.
5. **Erros Customizados e Globais:** Expandir o middleware de tratamento de erros no `server.ts` para capturar exceções do Prisma (`PrismaClientKnownRequestError`) e retornar códigos HTTP semânticos.
6. **Agrupamento de Rotas:** Refatorar o roteamento (Express routers) para um arquivo consolidado (`routes.index.ts`) segmentado por versão da API (ex: `/api/v1/`).
7. **Remoção de Código Morto:** Limpar arquivos não utilizados, importações não resolvidas e lógicas legadas comentadas.
8. **Substituição de Lógicas Inline:** Remover lógicas complexas diretamente inseridas no JSX/TSX no Frontend, movendo para custom hooks.
9. **Eliminação de Classes Utilitárias Duplicadas:** Consolidar funções repetidas de manipulação de data (`date-fns`) e formatação em `src/utils`.
10. **Validação de Entrada Consolidada:** Garantir que 100% das requisições HTTP passem por validações rigorosas de schema (Zod) antes de atingir os Controllers.

### Banco de Dados e Prisma
11. **Paginação Eficiente:** Substituir paginação por offset clássica (N+1 oculto e query slow) por Cursores (Cursor-based pagination) nas listagens massivas de `Leads` e `Activities`.
12. **Índices Ausentes:** Adicionar índices compostos em tabelas críticas, ex: `Lead(organizationId, status)` e `Contact(companyId, email)`.
13. **Queries N+1 Ocultas:** Substituir múltiplos `.include` no Prisma que degradam performance por queries separadas agregadas em memória, ou otimizar joins nativos.
14. **Soft Delete Estrutural:** Implementar Soft Delete nativo nas queries do repositório (`deletedAt`) e parar de apagar dados criticamente usando `deleteMany`.
15. **Gerenciamento do Connection Pool:** Substituir pooling nativo básico por PgBouncer para suportar pico de conexões sem estourar limite do driver PostgreSQL.
16. **Auditoria de Banco:** Refinar o `AuditLog` para usar triggers (ou Prisma Middleware unificado) garantindo que nenhuma alteração fuja do histórico.
17. **Transações Robusas:** Refatorar operações de criação que envolvem múltiplas tabelas (ex: criar Empresa, Contato e Lead) utilizando transações do Prisma `$transaction`.
18. **Migrations Limpas:** Criar squashes de migrations legadas para melhorar a velocidade da inicialização do banco.
19. **Otimização de Tipos de Dados:** Revisar colunas `String` que podem ser `Enum` ou `VARCHAR` dimensionados para otimizar espaço de disco.
20. **Constraint Enforcement:** Revisar constraints (FK, Unique) para evitar corrupções em cenários de alta concorrência.

### Frontend, UX/UI e Performance
21. **Performance do Vite (Bundle Size):** Aplicar *Tree Shaking* agressivo e Code Splitting nas rotas usando `React.lazy()` e `Suspense`.
22. **Overhead de Animações:** Padronizar as animações unificando Tailwind e Framer Motion, removendo *keyframes* manuais no `globals.css` para evitar repinturas constantes.
23. **Remoção de Estilos Inline:** Eliminar hardcoded `style={{ ... }}` em componentes React substituindo pela combinação de classes Tailwind e `cn()` (clsx/tailwind-merge).
24. **Abuso de Posicionamento Absoluto:** Refatorar layouts que usam `absolute` para centralização, trocando por Flexbox ou CSS Grid, melhorando a responsividade.
25. **Gerenciamento de Estado Global:** Avaliar componentes que fazem "prop drilling" excessivo, movendo estados críticos (auth, themes) para Context API ou Zustand.
26. **Renderizações Desnecessárias:** Envolver hooks dependentes e componentes passivos com `useMemo` e `React.memo` para evitar re-renders na listagem de Kanban.
27. **Acessibilidade (a11y):** Inserir atributos `aria-labels`, navegação via teclado para modais/drawers, e garantir contraste adequado no Tailwind.
28. **Feedback Visual:** Implementar Loading States globais (Skeleton UI) robustos para mitigar tela branca durante fetches.
29. **Tratamento de Exceções UI:** Implementar React Error Boundaries globais e locais para evitar que uma falha de API crashe toda a tela do sistema.
30. **Padronização do Z-Index:** Criar um mapa de variáveis de Z-Index (`z-10`, `z-50`) para prevenir sobreposição errônea de Tooltips, Modais e Dropdowns.

### Segurança e Hardening
31. **Isolamento Tenant (RLS):** Mover o filtro de tenant (`organizationId`) do backend lógico (middlewares) para Row Level Security (RLS) diretamente no PostgreSQL.
32. **Rate Limiting Refinado:** Configurar `express-rate-limit` focado em rotas sensíveis como autenticação, geração de AI e exportações.
33. **Cabeçalhos de Segurança:** Configurar e fortalecer CSP (Content Security Policy) via Helmet.
34. **Proteção Anti-SSRF:** Bloquear requisições de motores externos que parseiam URLs contra a rede interna.
35. **Sanitização de HTML:** Adicionar sanitização robusta (DOMPurify/isomórfico) nas notas de rich text antes de persistir no banco de dados para mitigar XSS.
36. **Controle de Sessão e Tokens:** Implementar Rotação de Refresh Tokens e invalidação central (Blacklist via Redis).
37. **Restrições CORS Corretas:** Impedir permissividade indiscriminada no CORS, travando para as origens estritas de deploy.
38. **Mapeamento PII e LGPD:** Criptografar dados sensíveis de contato (telefone/documento pessoal) em repouso e aplicar hash bidirecional seguro.
39. **Bloqueio de Brute Force:** Adicionar delays e lockouts via Redis para ataques de autenticação.
40. **Mascaramento de Logs:** Garantir que os logs da aplicação nunca printem credenciais, tokens ou senhas no console.

### Testes, Qualidade e Observabilidade
41. **Testes Unitários:** Aumentar a cobertura (coverage) dos UseCases (Atualmente os serviços têm baixa cobertura).
42. **Mocking Estrito nos Testes:** Impedir que testes unitários vazem para chamadas de banco de dados real.
43. **E2E Flakiness:** Resolver flakiness em testes de Playwright gerados por timeouts de renderização.
44. **Seeders Dinâmicos:** Refatorar os seeders para testes de integração garantindo um estado determinístico a cada run, evitando FK Exceptions.
45. **Logs Estruturados (JSON):** Refatorar todos os `console.log` para a biblioteca `pino`, enviando saídas em formato JSON para melhor consumo.
46. **Métricas Prometheus:** Exportar métricas de aplicação e banco para endpoints formatados Prometheus.
47. **Tracing Distribuído:** Integrar `@opentelemetry` de ponta a ponta (Frontend -> Backend -> BD) rastreando o `traceId`.
48. **CI/CD Pipeline Cash:** Otimizar o tempo de build do GitHub Actions adicionando cache estrito de pacotes node.
49. **Healthchecks Avançados:** Otimizar rota `/health` verificando também conexões de BD, Redis e conectividade LiteLLM.
50. **Refatoração do Arquivo `.env`:** Separar e documentar estritamente o que é exposto ao Vite (`VITE_`) do que é backend secreto.

---

## Parte 2: 50 Itens que Ainda Não Existem (Novas Features e Evolução Enterprise)

### Ecossistema de Inteligência Artificial (AI)
1. **Multi-Agent Orchestration:** Implementar CrewAI/LangGraph integrando múltiplos agentes complexos conversando entre si em background.
2. **Retrieval-Augmented Generation (RAG):** Construir pipelines de ingestão de documentos para RAG integrado à qualificação de leads.
3. **Embeddings Vetoriais (pgvector/Qdrant):** Habilitar busca semântica em todo o CRM usando pgvector nativo no PostgreSQL.
4. **Resumo de Reuniões Automático (Speech-to-Text):** Processamento de áudios de ligações comerciais para gerar transcrições via Whisper/Deepgram.
5. **Scoreboard Preditivo de Vendas:** Previsão de fechamento baseada em modelos de aprendizado de máquina usando histórico de dados.
6. **Automação de Cold Emails por IA:** Geração contextual, hyper-personalizada e autônoma de sequências de emails de acordo com o tom da Persona e restrições éticas.
7. **Simulação de Objeções (Roleplay de Voz):** Módulo de treinamento interno utilizando síntese de voz (TTS) para os SDRs treinarem com um bot B2B agressivo.
8. **Recomendação de Próximos Passos (Next Best Action):** Motor que lê a última atividade e sugere, via UI proativa, o que fazer (Ligar de volta, enviar proposta).
9. **Detecção de Sentimento na Comunicação:** Classificação térmica de notas e e-mails recebidos (Positivo/Negativo/Objeção).
10. **Geração de Propostas PDF via I.A:** Formulário para criar propostas comerciais em layout com curadoria de dados pré-prenchidos por IA.

### Automação de Fluxos, Workers e Integrações (Background)
11. **Filas Distribuídas (BullMQ/Redis):** Processamento de arquivos CSV (mass import), chamadas demoradas de IA e agendamentos rodando em background com retry e dead-letter-queues.
12. **Integração Omnichannel (WhatsApp):** Módulo nativo conectando-se a API Oficial do WhatsApp/Baileys para mensagens a prospects.
13. **Sync Bidirecional de Calendário (Google/Outlook):** Integração OAuth para refletir `Activities` como eventos no calendário do usuário.
14. **Sincronização de Caixas de E-mail (IMAP/SMTP):** Captura de threads e-mail trocadas para alimentar o CRM de forma passiva.
15. **Webhooks Customizados:** Permitir que o usuário do sistema dispare requisições para URLs de terceiros ao alterar o status do lead.
16. **App Zapier / Make:** Construção de um wrapper da API Rest para listar a plataforma nesses marketplaces de automação.
17. **Fluxos Visuais de Cadência:** Uma interface *node-based* (arrastar linhas) para montar caminhos (Se respondeu X, espere Y, mande Z).
18. **Integração ERP/Faturamento:** Sincronização direta das propostas Ganhas para o sistema contábil para emissão de nota (ex: ContaAzul, Omie).
19. **Dialer (Telefonia Nativa VOIP):** Click-to-call dentro da plataforma (integração Twilio ou Zenvia) registrando a chamada automaticamente.
20. **Integração LinkedIn (Extensão Chrome):** Uma ponte (extension) que permita prospectar contatos do LinkedIn enviando direto para o backend.

### Recursos B2B Enterprise (Security e Auth)
21. **Single Sign-On (SSO / SAML 2.0):** Integração corporativa com Microsoft Entra ID (Azure AD), Okta, e Google Workspace.
22. **Autenticação em Dois Fatores (MFA / 2FA):** Aplicação obrigatória via TOTP (Authenticator) e SMS.
23. **RBAC/ABAC Dinâmico e Customizável:** Interface para o Admin da conta criar perfis (Roles) de acesso altamente modulares (ex: "SDR Nível 1 - Pode ver leads mas não exportar").
24. **Cofre Virtual de Senhas/Chaves:** Módulo estilo HashiCorp Vault para armazenar tokens de APIs de clientes de forma segura.
25. **Data Residency / Multi-Region:** Arquitetura permitindo instâncias segmentadas para armazenar dados em regiões específicas atendendo leis governamentais rigorosas.
26. **Gestão de Sessões Ativas:** Interface para o usuário ver aparelhos conectados e derrubar remotamente (Force Logout).
27. **Logs de Auditoria Acessíveis ao Cliente:** Tela administrativa expondo o `AuditLog` para auditoria do próprio cliente.
28. **Controles Avançados de Compartilhamento:** Modelagem onde Usuário A pode delegar leitura de um lead apenas ao Usuário B temporariamente.
29. **Watermarking em Exportações:** Inclusão de marca d'água no backend ao exportar planilhas para desencorajar roubo de base.
30. **Termos de Uso e Consentimentos Dinâmicos:** Módulo de compliance para rastrear aceites em Privacy Policies antes do login.

### Dashboarding Avançado, Relatórios e Ferramentas Diárias
31. **Painéis de BI Customizáveis (Drag & Drop):** Funcionalidade para criar dashboards visuais manipulando dimensões de banco livremente.
32. **Relatório de Tempo em Status (Gargalos):** Gráfico que revela que um lead costuma ficar "Travado" na etapa "Qualificação" por X dias em média.
33. **Forecast de Vendas Avançado:** Modelo matemático que calcula receita esperada comparando pipeline ponderado contra metas do mês.
34. **Gamificação Comercial:** Placares (Leaderboards), conquistas e alertas lúdicos quando metas (pontos por prospect, fechamento) são alcançadas.
35. **Motor de Busca Global Full-Text (Meilisearch):** Uma barra estilo *Spotlight/Command+K* que busque instantaneamente Leads, Notas e Contatos com suporte a *Typos*.
36. **Editor de Documentos e Minutas Compartilhado:** Um ambiente rico dentro da plataforma (estilo Notion) vinculado aos Projetos/Leads.
37. **Painel de Consumo (Billing / Stripe):** Visão administrativa do uso de cotas (Tokens de LLM, Espaço em Disco) integrado ao gateway de pagamento para cross-sells.
38. **Mapas Geográficos de Prospects:** Visualização térmica de leads espalhados no mapa para o planejamento de visitas de campo de Field Sales.
39. **Multi-Moeda e Câmbios no Funil:** Suporte no pipeline para lidar com Oportunidades em Dólares, Euros, com conversão de tela padronizada.
40. **Tags Hieraquizáveis e Dependentes:** Criação de árvores lógicas para categorizar entidades em profundidade (ex: B2B > Tech > SaaS).

### Mobilidade e Usabilidade
41. **Aplicativo Mobile Nativo (PWA Avançado ou React Native):** Versão portátil dedicada com suporte push-notifications para SDRs nas ruas.
42. **Offline-First Mode Limitado:** Cache via *Service Workers* para que visitas à tela de contato ocorram mesmo em pontuais quedas de internet, sincronizando na volta (Optimistic UI).
43. **Integração de Notificações com Slack/Teams:** Canal para disparar avisos sempre que um contrato grande (Hot Lead) mover de etapa.
44. **Dark Mode / Tematização (White-Label):** Motor de estilo modular que permita o cliente hospedar na própria cor ou em domínio próprio (Custom Domains).
45. **Teclas de Atalhos Globais:** Hotkeys potentes (`Shift + L` cria Lead, `Esc` fecha painel) para *Power Users*.
46. **Módulo de Comissionamento e Split:** Calculadora atrelada às propostas ganhas determinando a comissão devida a cada ator (SDR, Closer).
47. **Geração de Código de Barras / QR Code:** Para tracking de presença em eventos (feiras comerciais) e associação imediata na base.
48. **Central de Ajuda Integrada (Knowledge Base UI):** Widget popover flutuante para acessar tutoriais e vídeos da própria plataforma.
49. **Agendador Universal de Tarefas:** Um painel consolidado com a agenda da equipe semanal e interface diária diária (estilo Kanban para atividades).
50. **Chatbook / CRM Comunitário (Social Sales):** Mini rede social interna para vendedores comentarem sucessos e pedirem apoio em contas difíceis com @ menções integradas nas timelines.

---
