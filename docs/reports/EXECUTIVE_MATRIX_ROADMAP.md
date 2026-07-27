# ROADMAP EXECUTIVO & MATRIZ DE EVOLUÇÃO ENTERPRISE (NexusOne OS)

Este documento funde a Visão de Roadmap e a Matriz de Evolução, categorizando por janelas de execução para priorizar o impacto direto ao usuário e à arquitetura.

## 1. QUICK WINS (1 a 3 dias)
| Módulo | Estado Desejado | Complexidade | Esforço | ROI | Prioridade | Risco | Critérios de Aceite |
|---|---|---|---|---|---|---|---|
| **Multi-tenancy Prisma** | Bloqueio automático de Queries no Prisma via Client Extension (`organizationId`). | Baixa | Baixo | Altíssimo | P0 | Baixo | Queries vazias de org travam globalmente. |
| **Observabilidade Base** | Exportador OTel integrado nativamente para Prometheus/Jaeger e logs com Pino. | Média | Baixo | Alto | P1 | Baixo | Traces disponíveis e logs estruturados em JSON no console. |
| **Testes Estáveis** | Manutenção da base 100% livre de Mocks de BD. | Concluído | Concluído | Altíssimo | P0 | Nulo | Suíte CI rodando DB local com singleThread sem concorrências. |
| **Segurança Rate Limit** | Rate Limiting ativo para endpoints via Redis na camada Express. | Baixa | Baixo | Médio | P2 | Baixo | Rejeição `429` para abusos de API de IA. |

## 2. CURTO PRAZO (1 a 2 semanas)
| Módulo | Estado Desejado | Complexidade | Esforço | ROI | Prioridade | Risco | Critérios de Aceite |
|---|---|---|---|---|---|---|---|
| **Filas & Workers** | BullMQ e Redis lidando com `enrichCompany` assíncrono. | Média | Médio | Alto | P0 | Médio | Background jobs estáveis, com UI no BullBoard ou log. |
| **LiteLLM Gateway** | Redirecionamento da IA para LiteLLM com Token Tracking e Custos por Agente habilitado. | Média | Médio | Alto | P0 | Baixo | Dashboard LiteLLM funcional registrando requests. |
| **Better Auth OAuth2** | Google e Microsoft login ativos com MFA habilitado. | Média | Médio | Alto | P1 | Médio | Criação de Sessão segura no Banco, MFA challenge funcional. |
| **Busca Desacoplada** | Update do Meilisearch movido de extension Prisma para evento no Event Bus/BullMQ. | Média | Médio | Médio | P2 | Baixo | Indexação rápida que não impacta tempo de gravação do Prisma. |

## 3. MÉDIO PRAZO (1 a 2 meses)
| Módulo | Estado Desejado | Complexidade | Esforço | ROI | Prioridade | Risco | Critérios de Aceite |
|---|---|---|---|---|---|---|---|
| **Agent Runtime (CrewAI)** | IA Autônoma (SDR) qualificando o ICP com memória vetorial via pgvector/Qdrant. | Alta | Alto | Altíssimo | P0 | Alto | IA envia fluxos para qualificação assertivamente usando RAG. |
| **RLS Postgres** | Integração em DB da RLS Multi-tenant baseada em contexto do JWT/Sessão. | Alta | Alto | Alto | P1 | Alto | Cross-Tenant estritamente bloqueado ao nível SQL. |
| **DevOps & Kubernetes** | Helm Charts e ArgoCD rodando em Staging para Blue/Green Deployments. Build Caching ativo. | Média | Alto | Médio | P2 | Baixo | Pipeline CI/CD declarativa rodando deployments zerodowntime. |
| **Auditoria** | Soft Deletes via Prisma Extensions e History Log de ações (Quem alterou o que e quando). | Baixa | Médio | Alto | P1 | Baixo | Trilha de auditoria gerada automaticamente no DB. |

## 4. LONGO PRAZO (3 a 6 meses)
| Módulo | Estado Desejado | Complexidade | Esforço | ROI | Prioridade | Risco | Critérios de Aceite |
|---|---|---|---|---|---|---|---|
| **Workflow Engine** | Flow Builder dinâmico integrado (Ex: n8n nativo ou engine proprietário React Flow + Temporal). | Crítica | Altíssimo | Altíssimo | P1 | Alto | Usuário desenha gatilhos automatizados na UI e backend processa. |
| **Segurança Proativa** | SAST, DAST, SBOM, WAF e Vault consolidados. | Média | Alto | Médio | P2 | Baixo | Relatórios zero trust limpos no rep e ingress controller ativo. |
| **Marketplace & Plugins** | Suporte nativo a webhooks externos, OAuth flow para apps 3rd party publicarem pro sistema. | Alta | Alto | Médio | P3 | Médio | Documentação OpenAPI viva, devs terceiros consumindo API. |
| **Disaster Recovery** | Replicação de Banco, Chaos Engineering programado (Monkey Testing). | Média | Alto | Médio | P2 | Médio | Retorno RTO/RPO dentro de SLAs agressivos de nível banco. |
