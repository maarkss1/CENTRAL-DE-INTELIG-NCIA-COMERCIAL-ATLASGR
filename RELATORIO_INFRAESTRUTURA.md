# RELATÓRIO TÉCNICO DE INFRAESTRUTURA ENTERPRISE

## 1. Visão Geral da Arquitetura
A infraestrutura do **Prospector-Atlas** foi modernizada para atender padrões de alta disponibilidade, escalabilidade e observabilidade requeridos por ambientes de nível Enterprise. As principais mudanças envolvem a conteinerização (Docker), a adoção do Kubernetes para orquestração e a introdução de camadas para Redis, monitoramento e disaster recovery.

### 1.1 Diagrama Conceitual
- **Aplicação (Node.js/Express + Vite)**: Containerizada via build Multi-stage garantindo imagens leves.
- **Banco de Dados (PostgreSQL)**: Arquitetura Primary-Replica com connection pooling habilitado pelo Prisma e pgbouncer (em produção). Compatibilidade validada com Prisma v6.
- **Cache e Mensageria (Redis)**: Para sessões, filas e rate limits (Cluster/Sentinel).
- **Storage**: Uso de Object Storage (S3-compatible) para arquivos, backups e assets com CDN na borda.
- **Orquestração (Kubernetes)**: Implementado via Helm com gerenciamento centralizado (Deployments, Services, ConfigMaps, Ingress com TLS, HPA e Secrets).

## 2. Conteinerização e Otimização
O novo `Dockerfile` baseia-se em *Multi-stage builds*:
- **Stage 1 (Builder)**: Instala as dependências, compila o Vite, Prisma e código TypeScript.
- **Stage 2 (Runner)**: Copia apenas os artefatos necessários (`dist`, `node_modules`, arquivos de banco), executando a aplicação sob um usuário não-root (nodejs:1001) por questões de segurança.
A imagem final é consideravelmente menor e imune ao acúmulo de artefatos de compilação.

## 3. Kubernetes & Helm Chart
O Helm Chart criado no diretório `charts/prospector-atlas` possui:
- **Deployment**: Configurado com probes de liveness (`/health/live`) e readiness (`/health/ready`).
- **HPA**: Horizontal Pod Autoscaler atrelado ao consumo de CPU (target de 80%).
- **Ingress**: Expõe a aplicação utilizando Nginx e TLS.
- **ConfigMap / Secret**: Desacoplamento entre configuração e variáveis sensíveis.
- **Service**: Comunicação interna e balanceamento de carga para os pods.

## 4. Banco de Dados e Cache
- **PostgreSQL HA**: Arquitetura Master/Slave implementada. A infraestrutura exige backup contínuo (WAL archiving via Barman/pgBackRest).
- **Redis Cluster**: Utilizado como Distributed Cache e no backend das filas de processamento (BullMQ) incluindo DLQ (Dead Letter Queue) para jobs com falha.

## 5. Monitoramento e Observabilidade
- **Prometheus e Grafana**: O `docker-compose.yml` gerado inclui os containers de Prometheus e Grafana. A aplicação exportará métricas customizadas na rota `/metrics`.
- **APM**: Instrumentação via OpenTelemetry / Jaeger garantem tracing em chamadas entre os microsserviços e o banco de dados.
- **Loki**: Gerenciamento centralizado de logs baseado em tags.

## 6. Segurança e Performance
- **Secrets Management**: Secrets sensíveis (Banco, API Keys) injetados via Secrets/ConfigMaps em K8s (integráveis ao HashiCorp Vault no ambiente final).
- **Performance**: A aplicação suporta Stress Tests por estar protegida por HPA no K8s e pelo pooler de conexão no DB.

## 7. Disaster Recovery
### 7.1 Runbook de Restauração de Banco
1. Localizar o snapshot ou log WAL mais recente no Storage.
2. Interromper conexões (scale-down para 0 replicas).
3. Efetuar o processo de PITR (Point-In-Time Recovery) da ferramenta.
4. Escalar as réplicas novamente e aguardar sincronização.

### 7.2 Runbook de Falha de Pod
- A política de `restartPolicy: Always` e a gestão pelo Deployment Controller recriará pods danificados.
- O liveness probe matará automaticamente os pods sem resposta.

### 7.3 Failover Cluster K8s
- A infraestrutura as Code (IaC) e o Helm Chart permitem a reconstrução completa em outra zona de disponibilidade em questão de minutos usando os repositórios Git.

## Próximos Passos
- Expandir integração com ferramentas de Chaos Engineering.
- Provisionamento real de Ingress via cert-manager.
- Expandir workers dedicados no Node.js para desacoplar filas de mensageria da API Core.
