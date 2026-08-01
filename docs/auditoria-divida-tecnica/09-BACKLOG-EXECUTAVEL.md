# Backlog Executável

Cada item é independente e pode virar um ticket. Ordenado pela prioridade da `03-MATRIZ-DIVIDA-TECNICA.md`.

---

### 1. Remover login backdoor
- **Descrição:** excluir `src/features/auth/components/Login.tsx`; remover `admin@prospector.com` de `AUTHORIZED_LOGIN_EMAILS` (`src/config/access-policy.ts`).
- **Arquivos afetados:** `src/features/auth/components/Login.tsx` (excluir), `src/config/access-policy.ts`, qualquer rota que importe `Login.tsx`.
- **Dependências:** nenhuma.
- **Critério de aceite:** build sem referências a `Login.tsx`; tentativa de login com `admin@prospector.com`/senha conhecida falha.
- **Esforço:** XS. **Risco:** baixo (componente não deveria estar em uso legítimo).
- **Testes obrigatórios:** teste de integração de login negando a conta removida.

### 2. Reescrever `AuthContext` para sessão real
- **Descrição:** substituir `currentUser` hardcoded por dado derivado de `authClient.useSession()`; implementar `canAccessAdminPanel`/`canAccessBrand` contra papel/permissão reais.
- **Arquivos afetados:** `src/contexts/AuthContext.tsx`, `src/components/layout/ProtectedRoute.tsx` (validar que continua funcionando com sessão real).
- **Dependências:** item 1 (evitar reintroduzir bypass via componente removido).
- **Critério de aceite:** usuário sem sessão válida é redirecionado a `/login`; usuário com sessão válida vê apenas os recursos permitidos pelo seu papel.
- **Esforço:** M. **Risco:** médio (pode expor bugs de UI que hoje "funcionam" só por causa do bypass — testar manualmente todos os fluxos principais).
- **Testes obrigatórios:** teste de `ProtectedRoute` com sessão ausente/inválida/válida; teste de UI para `canAccessAdminPanel`.

### 3. Corrigir `LoginScreen` para autenticação real
- **Descrição:** substituir o branch `matchedByEmail` por chamada real a `authClient.signIn.email`; remover `PRESET_USERS`.
- **Arquivos afetados:** `src/features/auth/components/LoginScreen.tsx`, `src/features/auth/constants/userPresets.ts` (excluir).
- **Dependências:** itens 1, 2.
- **Critério de aceite:** login só sucede com senha correta validada pelo servidor.
- **Esforço:** S. **Risco:** baixo.
- **Testes obrigatórios:** login com senha incorreta deve falhar; login com senha correta deve suceder.

### 4. Rotacionar credencial exposta e limpar `seed_users.ts`
- **Descrição:** rotacionar a senha da conta real identificada em `seed_users.ts`; mover geração de senha de seed para variável de ambiente/senha aleatória; remover o arquivo do histórico do Git.
- **Arquivos afetados:** `seed_users.ts` (reescrever ou remover), histórico do Git (requer `git filter-repo`/BFG — **ação a ser coordenada com o usuário antes de reescrever histórico compartilhado**).
- **Dependências:** nenhuma, mas a reescrita de histórico impacta todos os clones existentes — comunicar ao time antes de executar.
- **Critério de aceite:** senha antiga não funciona mais em nenhum sistema; arquivo não contém mais segredos reais.
- **Esforço:** S (rotação) + coordenação para limpeza de histórico.
- **Testes obrigatórios:** nenhum automatizado; validação manual de que a conta foi rotacionada.

### 5. Isolamento de tenant nas tabelas de IA/conhecimento
- **Descrição:** adicionar coluna `organizationId` (indexada, com FK) a `KnowledgeChunk`, `Document`, `DocumentChunk`, `Prompt`, `AgentMemory`, `AILog`; adicionar política RLS; atualizar `search.service.ts`/`ingestion.service.ts`/`vector.service.ts` para filtrar por organização em toda query.
- **Arquivos afetados:** `prisma/schema.prisma`, nova migration, `src/features/knowledge/search.service.ts`, `src/features/knowledge/ingestion.service.ts`, `src/features/intelligence/services/vector.service.ts`, `vector-search.service.ts`.
- **Dependências:** nenhuma.
- **Critério de aceite:** busca de RAG/conhecimento de um tenant nunca retorna documentos de outro tenant (validado por teste de integração com dois tenants de teste).
- **Esforço:** M. **Risco:** médio (migration de dados existentes precisa de estratégia de backfill se já houver dados sem organização associada).
- **Testes obrigatórios:** teste de integração com dois `organizationId` distintos confirmando isolamento.

### 6. RLS para `Prospect` e `AIPendingAction`
- **Descrição:** adicionar política RLS igual à usada em `Company`/`Lead`.
- **Arquivos afetados:** nova migration Prisma.
- **Dependências:** nenhuma.
- **Critério de aceite:** query direta ao banco sem contexto de tenant não retorna linhas dessas tabelas.
- **Esforço:** S. **Risco:** baixo.
- **Testes obrigatórios:** teste de integração confirmando bloqueio cross-tenant.

### 7. Corrigir SSRF no export Bitrix24
- **Descrição:** validar `webhookUrl` contra allowlist de domínios Bitrix24 conhecidos; resolver DNS e rejeitar IP privado/link-local antes do fetch; não ecoar corpo de resposta bruto ao cliente.
- **Arquivos afetados:** `src/lib/adapters/crm/Bitrix24Adapter.ts`.
- **Dependências:** nenhuma.
- **Critério de aceite:** tentativa de exportar para URL interna/privada é rejeitada com erro claro.
- **Esforço:** S. **Risco:** baixo.
- **Testes obrigatórios:** teste unitário com URLs internas/privadas sendo rejeitadas; teste com domínio Bitrix24 válido continuando a funcionar.

### 8. Adicionar passo de teste real ao deploy de produção
- **Descrição:** descomentar/implementar o passo de teste em `.github/workflows/production.yaml`; adicionar lint e `npm audit`; adicionar gate de aprovação manual (`environment:` protegido) antes do publish.
- **Arquivos afetados:** `.github/workflows/production.yaml`.
- **Dependências:** nenhuma.
- **Critério de aceite:** push em `main` com teste falhando não publica imagem.
- **Esforço:** S. **Risco:** baixo.
- **Testes obrigatórios:** validar manualmente que um PR com teste quebrado é bloqueado no pipeline.

### 9. Sessão WhatsApp multi-tenant
- **Descrição:** mover `sock`/`currentQr`/`status` de variáveis de módulo para um mapa chaveado por `organizationId`, persistido/coordenado via Redis; segregar `whatsapp_auth/` por tenant.
- **Arquivos afetados:** `src/features/integrations/whatsapp/whatsapp.service.ts`, `whatsapp.routes.ts`.
- **Dependências:** nenhuma.
- **Critério de aceite:** dois tenants distintos têm sessões WhatsApp independentes; usuário de um tenant não vê/controla a sessão de outro.
- **Esforço:** M. **Risco:** médio (mudança estrutural na integração).
- **Testes obrigatórios:** teste de integração com dois tenants confirmando isolamento de sessão.

### 10. Corrigir defaults inseguros de ambiente
- **Descrição:** remover default de `NODE_ENV` (fail-closed); mudar default de `ALLOW_DEV_AUTH_BYPASS` para `false`; adicionar assert de boot.
- **Arquivos afetados:** `src/config/env.ts`, `src/shared/middlewares/authenticateToken.ts`.
- **Dependências:** nenhuma.
- **Critério de aceite:** aplicação recusa subir se `NODE_ENV` ausente ou se bypass ativo em produção.
- **Esforço:** XS. **Risco:** baixo.
- **Testes obrigatórios:** teste unitário do assert de boot.

### 11. Remover fallback de métricas fabricadas em analytics
- **Descrição:** remover o bloco try/catch que retorna dados hardcoded quando o banco falha; retornar erro HTTP real.
- **Arquivos afetados:** `src/features/analytics/routes/analytics.routes.ts`.
- **Dependências:** nenhuma.
- **Critério de aceite:** falha simulada de banco retorna 5xx, não 200 com dado fake.
- **Esforço:** XS. **Risco:** baixo (pode expor uma falha de UX hoje mascarada — comunicar ao time de produto).
- **Testes obrigatórios:** teste simulando falha de banco e validando resposta de erro.

### 12. Corrigir bug Swarm→SDR (leadId/instruction)
- **Descrição:** garantir que `SwarmOrchestrator.sdrNode` resolva/propague um `leadId` real (não a string de missão) para `SDRQualificationAgent.run`.
- **Arquivos afetados:** `src/features/intelligence/agents/supervisor.agent.ts`, possivelmente o schema de decisão do supervisor.
- **Dependências:** nenhuma.
- **Critério de aceite:** rota Swarm com um lead real produz qualificação válida (não "Erro: Lead não encontrado").
- **Esforço:** S. **Risco:** baixo.
- **Testes obrigatórios:** teste de integração do fluxo Swarm→SDR com lead de teste.

### 13. Executor para `AIPendingAction` aprovada
- **Descrição:** implementar worker/rota que consome ações aprovadas (`approved: true, executed: false`) e as executa de fato (ex.: envio de e-mail); ou, alternativamente, ajustar a UI para deixar claro que "aprovar" não envia automaticamente.
- **Arquivos afetados:** novo worker em `src/lib/queue/`, `src/features/intelligence/routes/intelligence.routes.ts`.
- **Dependências:** nenhuma.
- **Critério de aceite:** ação aprovada é executada (ou a UI deixa de prometer isso).
- **Esforço:** M. **Risco:** médio (depender de decisão de produto sobre o comportamento esperado).
- **Testes obrigatórios:** teste de integração cobrindo aprovação → execução.

### 14. Paginação em `activity.service.ts`
- **Descrição:** adicionar `take`/`skip` e parâmetros de página à listagem de atividades.
- **Arquivos afetados:** `src/features/activities/services/activity.service.ts`, `ActivityController.ts`, `ActivityList.tsx` (frontend, se necessário adaptar).
- **Dependências:** nenhuma.
- **Critério de aceite:** listagem de atividades aceita `page`/`limit` e não carrega toda a tabela.
- **Esforço:** S. **Risco:** baixo.
- **Testes obrigatórios:** teste de integração validando paginação.

### 15. Corrigir busca em memória em `prospecting.service.ts`
- **Descrição:** substituir carregamento de todas as empresas + `.find()` em memória por query filtrada pelo CNPJ normalizado.
- **Arquivos afetados:** `src/features/prospecting/services/prospecting.service.ts::findExistingCompany`.
- **Dependências:** nenhuma.
- **Critério de aceite:** a busca não carrega mais de N registros por chamada (validar com teste de performance simples ou contagem de queries).
- **Esforço:** S. **Risco:** baixo.
- **Testes obrigatórios:** teste unitário confirmando o comportamento de busca por CNPJ normalizado.

### 16. Migrar formulários para `react-hook-form` + `zod`
- **Descrição:** refatorar `CompanyForm.tsx`/`ContactForm.tsx` (e demais) para usar `useForm`+`zodResolver`, com schema compartilhado incluindo validação de formato de CNPJ.
- **Arquivos afetados:** `src/features/companies/components/CompanyForm.tsx`, `src/features/contacts/components/ContactForm.tsx`, novo `src/shared/validators/*.schema.ts` se necessário.
- **Dependências:** nenhuma.
- **Critério de aceite:** formulários exibem erro de validação por campo; CNPJ inválido é rejeitado antes do submit.
- **Esforço:** M. **Risco:** baixo.
- **Testes obrigatórios:** teste de componente validando mensagens de erro.

### 17. Acessibilidade em `Drawer.tsx`
- **Descrição:** adicionar `role="dialog"`, `aria-modal="true"`, trap de foco e handler de `Escape`.
- **Arquivos afetados:** `src/components/ui/Drawer.tsx`.
- **Dependências:** nenhuma.
- **Critério de aceite:** navegação por teclado consegue abrir, navegar dentro e fechar o drawer com Escape.
- **Esforço:** S. **Risco:** baixo.
- **Testes obrigatórios:** teste de componente com `@testing-library/user-event` simulando teclado.

### 18. Limpeza de dependências e código morto
- **Descrição:** remover `mammoth`, `jsonwebtoken` (se confirmado não usado), `DataTable.tsx`, `Atlas3DGame.tsx`, consolidar `framer-motion`/`motion`, renomear `package.json.name`.
- **Arquivos afetados:** `package.json`, arquivos listados.
- **Dependências:** nenhuma.
- **Critério de aceite:** build passa sem os pacotes/arquivos removidos; bundle size reduzido (validar com `vite build` bem-sucedido em ambiente não sandboxado).
- **Esforço:** S. **Risco:** baixo (double-check antes de remover `jsonwebtoken`, conforme nota do agente de segurança).
- **Testes obrigatórios:** suíte completa deve continuar passando.

### 19. Consolidar manifests ArgoCD de homolog
- **Descrição:** remover um dos dois `Application` conflitantes; manter uma única fonte de verdade apontando para o repositório/namespace corretos.
- **Arquivos afetados:** `k8s/argocd-app-homolog.yaml` ou `argocd/application-homolog.yaml` (remover um).
- **Dependências:** nenhuma, mas requer validação com quem administra o cluster ArgoCD.
- **Critério de aceite:** apenas um `Application` com esse nome existe no repositório.
- **Esforço:** XS. **Risco:** baixo.
- **Testes obrigatórios:** nenhum automatizado — validação manual de sync no ArgoCD.

### 20. Adicionar `test:e2e` ao CI e escrever specs reais
- **Descrição:** adicionar step de Playwright ao `ci.yml`; escrever specs de login (pós-correção), CRUD de lead e navegação principal.
- **Arquivos afetados:** `.github/workflows/ci.yml`, `tests/e2e/*.spec.ts`.
- **Dependências:** itens 1-3 (login precisa estar corrigido para o spec de login fazer sentido).
- **Critério de aceite:** `test:e2e` roda no CI e falha se os fluxos principais quebrarem.
- **Esforço:** M. **Risco:** baixo.
- **Testes obrigatórios:** os próprios specs E2E.

---

## Score de Maturidade (0-100 por dimensão)

| Dimensão | Nota | Justificativa resumida |
|---|---:|---|
| Arquitetura | 55 | Camadas limpas em 5 de 28 módulos; acoplamento cruzado e componentes "deus" identificados |
| Código | 50 | Duplicação real de CRUD, arquivos grandes, mas sem sinais de complexidade acidental generalizada |
| Tipagem | 72 | `strict` habilitado, `tsc` limpo; poucos `as any` pontuais em caminhos sensíveis |
| Testes | 28 | Proporção ~1:9, zero cobertura em áreas de maior risco, E2E decorativo e fora do CI |
| Segurança | 22 | Autenticação de fato desabilitada + SSRF + vazamento cross-tenant em IA — desqualificante apesar de bom isolamento no domínio central |
| Performance | 58 | Poucos pontos comprovados de gargalo; maioria é risco/oportunidade, não falha observada em produção |
| Banco de dados | 50 | RLS bem desenhado mas com drift (2 tabelas fora), índices faltando, uma migration de reconciliação de drift histórico |
| DevOps | 45 | CI principal robusto, mas deploy de produção sem teste e manifests de infraestrutura conflitantes/incompletos |
| Observabilidade | 68 | Logging estruturado, correlation ID e OpenTelemetry genuínos — ponto forte real do sistema |
| Documentação | 40 | Volume extenso mas fragmentado (34 relatórios curtos) e com trechos desatualizados/conflitantes |
| Experiência do desenvolvedor | 50 | Tipagem forte ajuda, mas árvore de dependências pesada e scripts soltos na raiz atrapalham |
| Experiência do usuário | 48 | Boas práticas de lazy-loading/roteamento, mas dados fabricados apresentados como reais corroem confiança |
| Integrações | 42 | Apollo/gateway de IA maduros; Google mockado, WhatsApp frágil, Bitrix com SSRF |
| IA | 50 | Arquitetura de agentes sofisticada e gateway resiliente, mas com bug real de integração, aprovação que não executa, e PII sem minimização |

**TECHNICAL HEALTH SCORE: 45/100** (não é média aritmética simples das dimensões acima — segurança tem peso desqualificante conforme metodologia da Seção 21 do prompt de auditoria; ver `00-RESUMO-EXECUTIVO.md`).
