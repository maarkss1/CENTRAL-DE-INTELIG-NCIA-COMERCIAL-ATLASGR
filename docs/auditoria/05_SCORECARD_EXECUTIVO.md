# SCORECARD EXECUTIVO — CENTRAL DE INTELIGÊNCIA COMERCIAL ATLAS GR

**Data:** 16 de Agosto de 2026  
**Auditor:** Principal Software Architect, Staff Engineer, Security Lead & QA Lead  

---

## 1. Scorecard de Maturidade e Prontidão Operacional

```text
MATURIDADE GLOBAL .............. 78%  (3.9 / 5.0)
PRODUCTION READINESS ........... 82%
QUALIDADE DO CÓDIGO ............ 85%
LEGIBILIDADE ................... 88%
MANUTENIBILIDADE ............... 82%
ARQUITETURA .................... 84%
SEGURANÇA ...................... 86%
TESTES ......................... 89%
UX/UI .......................... 84%
ACESSIBILIDADE ................. 78%
PERFORMANCE .................... 85%
BANCO DE DADOS ................. 90%
INTEGRAÇÕES .................... 86%
BITRIX24 ....................... 92%
IA ............................. 85%
OBSERVABILIDADE ................ 76%
INFRAESTRUTURA ................. 80%
DOCUMENTAÇÃO ................... 86%
LGPD ........................... 88%
```

---

## 2. Diagnóstico Executivo

### Estado Atual
```text
PRODUCTION CANDIDATE (com restrições de governança externa e integração final de assinatura)
```

### Nível Predominante do Código
```text
SÊNIOR (com fortes componentes Staff/Enterprise na camada de RLS, Circuit Breaker e Máquinas de Estado de Cadência)
```

### Resposta à Pergunta Central: Pode Ir para Produção?
```text
SIM, COM RESTRIÇÕES
```

**Restrições Obrigatórias para Liberação:**
1. Ação de Governança Externa: Decisão e execução de reescrita de histórico Git para eliminar `backups/*.dump` (DT-0001).
2. Rotação manual de credenciais antigas nos painéis da Bland AI e Bitrix24 (DT-0003).
3. Configuração de DNS e publicação de `assetlinks.json` para deep links do app móvel (DT-0009).

---

## 3. TOP 20 RISCOS ATUAIS

| # | Risco | Domínio | Probabilidade | Impacto | Severidade | Mitigação no Código |
|---|---|---|---|---|---|---|
| 1 | Presença de dump com dados pessoais no histórico Git | Segurança / LGPD | Média | Altíssimo | CRITICAL | Removido do working tree; exige `git filter-repo` no histórico |
| 2 | Chaves antigas ainda válidas nos painéis de terceiros | Segurança / Financeiro | Média | Alto | HIGH | Sanitizado no código; exige rotação manual nos portais |
| 3 | Concorrência de workers duplicados se ambos os containers subirem | Backend / Filas | Baixa | Médio | HIGH | Controlável por flags de ambiente; handoff 16-00 pronto |
| 4 | Indisponibilidade de provedor de IA sob picos de tráfego | IA / Confiabilidade | Média | Médio | MEDIUM | Circuit breaker local e fallback para modelos alternativos ativos |
| 5 | Falha de persistência de `AILog` em instâncias sem banco ativo | IA / Auditoria | Baixa | Baixo | MEDIUM | Logging de aviso fail-safe implementado (não trava a geração) |
| 6 | Falha silenciosa de sincronização Bitrix por estouro de rate limit | Integrações | Baixa | Médio | MEDIUM | Backoff exponencial com jitter e contador Prometheus de falhas |
| 7 | Queda de conexões ativas do WhatsApp por restart da API HTTP | Integrações / Mensageria| Média | Médio | MEDIUM | Baileys com reconexão automática; plano de worker isolado |
| 8 | Bloqueio de e-mails em massa por falta de reputação de domínio | Prospecção | Alta | Alto | HIGH | Janelas de envio em horário comercial e validação MX/SMTP |
| 9 | Opt-out ignorado por canal divergente | LGPD / Compliance | Baixa | Altíssimo | HIGH | Modelo unificado `OptOutRecord` consultado antes de qualquer disparo |
| 10 | Falha de isolamento cross-tenant por query crua sem RLS | Banco / Tenancy | Baixíssima | Altíssimo | CRITICAL | RLS forçada no PostgreSQL + `withRlsContext` com transações |
| 11 | Falsificação de Webhooks de telefonia externa (3CX / Bland) | Segurança / APIs | Baixa | Alto | HIGH | Validação de token em tempo constante (`timingSafeEqual`) e HMAC |
| 12 | Estouro de memória em extrações massivas do Bitrix24 | Backend / Memória | Baixa | Médio | MEDIUM | Paginação por cursor (`next`) e processamento assíncrono em lote |
| 13 | Alucinação de IA alterando estágio de oportunidade comercial | IA / Produto | Baixíssima | Alto | HIGH | Trava de fechamento determinístico (`DealClosureEvent`) imutável |
| 14 | Descarte acidental de lead quente por automação de estagnação | CRM / Vendas | Baixa | Médio | MEDIUM | Scanner restrito a regras opt-in configuradas por organização |
| 15 | Falha de monitoramento por ausência de alerta 5xx em tempo real | Observabilidade | Média | Médio | MEDIUM | Alertas definidos no Prometheus; requer conexão no Alertmanager |
| 16 | Usuário de teclado bloqueado em sub-painéis de IA | Acessibilidade / UX | Média | Baixo | MEDIUM | 73 warnings mapeados para resolução de `onKeyDown` |
| 17 | Deep link do app mobile não redirecionando para o card correto | Mobile / UX | Média | Baixo | LOW | Fallback para SPA webview ativo |
| 18 | Perda de integridade referencial em exclusão de organização pai | Banco de Dados | Baixíssima | Alto | HIGH | Constraints `onDelete: Cascade` mapeadas e testadas |
| 19 | Vazamento de memória por SSE aberto em abas em background | Frontend / Perf | Baixa | Baixo | LOW | Cleanup de EventSource no `useEffect` de desmontagem |
| 20 | Deploy falhando por migrations não aplicadas no container | CI/CD / Release | Baixíssima | Alto | HIGH | Migration Job no Helm e `prisma migrate deploy` no startCommand |

---

## 4. TOP 20 AÇÕES COM MAIOR RETORNO

| Ordem | Ação | Domínio | Esforço | Impacto | Retorno / Benefício |
|---|---|---|---|---|---|
| **1** | Higienizar histórico Git (`git filter-repo`) | Segurança | M | Imediato | Elimina 100% dos riscos regulatórios LGPD de dados residuais |
| **2** | Rotacionar chaves Bland AI e Bitrix nos portais externos | Segurança | S | Imediato | Garante segurança financeira e de acesso externo |
| **3** | Aplicar remoção de workers de `server.ts` (Handoff 16-00) | Backend | S | Alto | Elimina risco de concorrência e reduz consumo de RAM no web |
| **4** | Publicar `assetlinks.json` e validar deep links no app | Mobile | S | Alto | Proporciona experiência móvel profissional para a equipe de campo |
| **5** | Conectar alertas Prometheus ao Slack/Discord via Alertmanager | SRE | S | Alto | Garante observabilidade 24/7 ("descoberta automática às 03:00") |
| **6** | Zerar os 73 warnings restantes no ESLint (`jsx-a11y`) | Frontend | M | Médio | Conquista padrão WCAG AA e limpa 100% dos logs de CI |
| **7** | Implementar Command Palette (`⌘K`) interativa | UX / Produtividade | M | Alto | Aumenta drasticamente a velocidade de operação dos vendedores |
| **8** | Conectar adaptador Gov.br para assinatura digital de propostas | Cadência | L | Altíssimo | Automatiza o ciclo de fechamento comercial de ponta a ponta |
| **9** | Habilitar execução de `test:integration` no GitHub Actions | CI/CD | S | Altíssimo | Impede regressões de RLS e queries em qualquer PR futuro |
| **10** | Regenerar snapshots do Playwright no Linux para reativar testes | QA / E2E | S | Médio | Reativa 100% dos testes E2E sem nenhum `test.skip` |
| **11** | Unificar métrica de latência HTTP no middleware Express | Observabilidade | S | Médio | Fornece baselines reais de P50/P95/P99 nos dashboards Grafana |
| **12** | Mover persistência de sessões Baileys WhatsApp para o Redis | Integrações | M | Médio | Evita desconexões do WhatsApp durante deploys e reinicializações |
| **13** | Criar interface de auto-atendimento para direitos do titular LGPD | LGPD / Compliance | M | Médio | Reduz esforço manual de conformidade e suporte jurídico |
| **14** | Implementar dashboard Grafana exclusivo para as 14 filas BullMQ | SRE / Operação | S | Médio | Permite visualização em tempo real de gargalos e taxas de processamento |
| **15** | Criar UI para extrações assíncronas em lote do Bitrix | Integrações | M | Médio | Facilita a migração massiva de bases legadas sem travamento |
| **16** | Deprecar model `Prospect` em favor de `Lead` unificado | Banco / Prisma | M | Baixo | Reduz redundância de schema e complexidade de manutenção |
| **17** | Criar suíte de testes de carga contínua (k6) no pipeline | QA / Performance | M | Médio | Valida capacidade volumétrica antes de campanhas massivas |
| **18** | Implementar persistência de XP de gamificação no banco | Produto / Engajamento| S | Baixo | Estimula a adoção do CRM pela equipe comercial |
| **19** | Configurar backup diário automatizado com script de restore testado | Infra / Backup | S | Alto | Garante Disaster Recovery comprovado com RPO < 24h e RTO < 1h |
| **20** | Adicionar suporte a gateway de faturamento (Asaas/Stripe) | Monetização | L | Médio | Permite monetização SaaS automatizada com bloqueio por cota |
