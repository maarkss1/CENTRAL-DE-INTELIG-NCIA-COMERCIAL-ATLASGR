# AGENTS.md - Governança Global de Agentes

## Projeto
CENTRAL-DE-INTELIGENCIA-COMECIAL-ATLASGR

Este arquivo é a regra global para qualquer agente que trabalhe neste repositório. Regras locais em `AGENTS.md` refinam escopo, mas nunca anulam segurança, qualidade, propriedade, tenancy, LGPD, verificação ou coordenação definidas aqui. Em caso de conflito, este arquivo vence.

## Estrutura oficial de agentes

### Coordenação
- **00 - Coordenador / Chief Commercial Intelligence Engineering Orchestrator**

### Plataforma e produto
- **01 - Plataforma, Segurança e Dados**
- **01A - Confiabilidade de Dados, RLS e Retenção** - especialista interno do 01, ocupa o mesmo slot; 01 e 01A nunca rodam simultaneamente
- **02 - Produto e UX**
- **03 - Design e Acessibilidade**
- **04 - CRM e BI**
- **05 - Prospecção**
- **06 - Integrações e Bitrix**
- **06A - Extrações Bitrix** - especialista interno do 06, ocupa o mesmo slot; 06 e 06A nunca rodam simultaneamente
- **07 - IA e Automações**
- **08 - QA, CI/CD, Deploy e Release Gatekeeper**
- **09 - Mobile, Capacitor e Android**
- **10 - Infraestrutura, Observabilidade e SRE**
- **11 - Marca e Ativos Institucionais**
- **12 - Voz e Telefonia / Birthub Voices**

### Especialistas de hardening e evolução
- **13 - Enxame Autônomo e Governança de Agentes de Runtime**
- **14 - Ambiente de Execução e Test Harness**
- **15 - Segurança Aplicada e Rotação de Segredos**
- **16 - Runtime, Workers e Escala**
- **17 - Cadência Multicanal e Ciclo de Receita**
- **18 - Contratos, API e Documentação Viva**

### Agentes de controle independentes
- **19 - Sentinela de Verificação Contínua** - obrigatório depois de toda alteração lógica rastreada e antes de qualquer integração
- **20 - Experiência Real, Jornadas e Bug Reporter** - black-box UX, jornadas ponta a ponta e relatos pela própria UI `Reportar um problema`

Prompts oficiais vivem em `.agents/prompts/`.

**Contagem oficial:** 23 perfis de prompt: 21 agentes numerados `00` a `20`, mais os especialistas internos `01A` e `06A`. Como `01A` compartilha slot com `01` e `06A` compartilha slot com `06`, eles não aumentam a concorrência simultânea nesses domínios.

Nenhum especialista edita o próprio prompt ou o prompt de outro agente durante uma missão. Mudança em `.agents/prompts/**` é decisão humana de governança.

## O que permanece ativo
Nenhum agente existente deve ser removido apenas porque não participa de uma fase específica. Os domínios continuam distintos:
- 08 governa CI/release, enquanto 14 mantém o harness e 19 verifica toda mudança;
- 02 implementa UX, 03 corrige design/acessibilidade e 20 testa a experiência como usuário real;
- 07 governa IA/automação, 13 o enxame autônomo e 17 o ciclo de receita;
- 18 impede deriva de contratos/documentação;
- 09, 11 e 12 são especialistas sob demanda quando mobile, marca ou voz forem afetados.

Agente sem trabalho na fase fica inativo. Não inventar tarefa para justificar sua existência.

## Regra de concorrência
O Coordenador ocupa 1 slot. Podem executar simultaneamente até **8 especialistas**, desde que todas as condições abaixo sejam verdadeiras:

1. **Isolamento:** cada especialista em branch/worktree próprio.
2. **Propriedade disjunta:** matriz de arquivos publicada antes da execução.
3. **Gate por leva:** integrar no máximo 2-3 merges antes de novo gate.
4. **Sem bloqueador mútuo:** agentes que dependem um do outro não executam como se fossem independentes.
5. **Dono único em arquivos compartilhados:** schema, `server.ts`, `package.json`, navegação, CI e infraestrutura respeitam seus donos.
6. **Capacidade real da ferramenta:** reduza a concorrência se sessões/worktrees/recursos não suportarem N.

O Agente 19 é chamado entre alterações e integrações; ele não precisa permanecer ocupando um slot enquanto outros agentes codificam.

## Regra obrigatória de verificação contínua

### Gatilho universal do Agente 19
Toda alteração lógica que modifique comportamento, código, testes, configuração, schema, migration, segurança, infraestrutura, runtime, integração, API, UX ou deploy deve seguir:

```text
ALTERAÇÃO
  -> AGENTE 19
  -> GATE COMPLETO
  -> PASS / BLOCKED
  -> somente com PASS pode integrar
```

O gatilho ocorre:
- depois de cada alteração lógica concluída por qualquer agente;
- depois de cada merge na branch de integração;
- obrigatoriamente a cada leva de 2-3 merges;
- depois de uma correção originada por falha de teste;
- antes de fechar handoff bloqueador;
- antes de aprovar qualquer fase;
- antes de Release Candidate e Go-Live.

Alterações apenas em arquivos de evidência gerados pelo 19/00 não disparam recursivamente o próprio 19.

Nenhum agente pode se autoaprovar. O agente que implementou a mudança executa testes locais do próprio domínio, mas a validação independente final daquela mudança pertence ao 19.

### Gate padrão do Agente 19
```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
```

Quando existirem e forem aplicáveis:
```bash
npm run verify:integrations
npm run verify:ai
npm run verify:prod
npm run test:containers
npm run setup:db:check
npm run security:trivy
npm run security:zap
```

A varredura de segredos também é obrigatória. `exit 0` com zero testes, suíte inteira skipada ou CI de outro SHA não conta como evidência.

Resultado do 19: `PASS`, `PASS_WITH_NON_BLOCKING_WARNINGS` ou `BLOCKED`. `BLOCKED` impede integração.

## Regra obrigatória de experiência real

### Agente 20
O Agente 20 testa a aplicação como usuário real, sem corrigir o produto durante o sweep.

Ele deve ser acionado:
- em modo targeted após alteração visível ao usuário, mudança de rota, formulário, navegação ou API consumida pelo frontend;
- para retestar bug corrigido;
- em full sweep na Fase Final 4;
- em smoke dirigido antes e depois do Go-Live na Fase Final 5.

No full sweep, o 20 inventaria rotas, módulos, feature flags, papéis, marcas e jornadas a partir do código atual, testa todas as capacidades aplicáveis e registra defeitos reproduzíveis pelo botão global **`Reportar um problema`**.

O relato deve usar a UI real para que URL, rota, brand, user agent, viewport e logs recentes sejam anexados automaticamente e sanitizados pelo fluxo existente. Nunca incluir segredo ou PII real no relato.

Se o próprio reporter estiver quebrado, o 20 registra a evidência sanitizada via handoff e classifica o módulo de reporte como finding.

Um bug reportado pelo 20 só é considerado resolvido depois de:
1. correção pelo agente dono;
2. `PASS` do Agente 19;
3. reteste da jornada original pelo Agente 20.

## Isolamento de execução
Agentes em paralelo nunca compartilham o mesmo working tree.

Antes de iniciar uma fase/onda, o Coordenador:
1. cria/atualiza branch de integração;
2. cria branch por especialista a partir do mesmo baseline;
3. cria worktree dedicado quando o ambiente suportar;
4. publica a matriz de propriedade;
5. entrega a cada especialista apenas o próprio worktree.

Cada especialista:
- trabalha apenas no próprio worktree;
- faz commits pequenos e coerentes prefixados pelo id;
- nunca executa `git push --force` nem reescreve histórico compartilhado;
- roda testes do próprio domínio antes de entregar;
- chama/aguarda o 19 antes de declarar a alteração pronta.

O Coordenador integra em levas de 2-3 merges, aciona 19 na branch de integração e reverte/isola o merge causal se o gate ficar vermelho.

## Protocolo de handoff
Formato:
`.agents/handoffs/<fase-ou-onda>/<de>-para-<para>-<slug>.md`

Conteúdo mínimo:
```markdown
- De: <agente origem>
- Para: <agente destino>
- Fase/Onda: <id>
- Status: aberto | em-andamento | resolvido
- Prioridade: bloqueador | alto | normal
## Problema
## Arquivo(s) envolvido(s)
## Alteração necessária
## Teste esperado
## Contexto adicional
```

Regras:
- qualquer agente cria o próprio handoff;
- destinatário pode atualizar Status e adicionar `## Resolução`, sem apagar o pedido original;
- nenhuma fase fecha com handoff `bloqueador` aberto;
- resolução técnica precisa de verificação 19;
- resolução de jornada reportada pelo 20 precisa de reteste 20.

## Scripts ausentes
Antes de qualquer `npm run <script>`, confirme que ele existe.

Se não existir:
- não trate como sucesso;
- registre a ausência;
- se deveria existir, abra handoff para 08/14/00 conforme propriedade;
- gate obrigatório ausente classifica a verificação como `BLOCKED` até decisão explícita do Coordenador.

## Propriedade exclusiva de arquivos
- `prisma/schema.prisma` e migrations: somente 01/01A, nunca simultâneos.
- `src/App.tsx`, navegação principal e Sidebar: somente 02.
- `tests/**`, configs Vitest/Playwright e `scripts/test/**`: 14, salvo delegação explícita; 19 executa, não toma propriedade.
- `.github/workflows/**`, `Dockerfile`, `docker-compose.yml` raiz e `render.yaml`: 08.
- `k8s/**`, `argocd/**`, `charts/**`, `infrastructure/**`: 10.
- `android/**`, `capacitor.config.ts`: 09.
- `identidade-visual/**`, `documentacao-aplicacao/**`: 11.
- `docs/security/**`, `scripts/security/**`: 15.
- `src/lib/queue/**`, runtime assíncrono e entrypoint de worker: 16, respeitando contratos dos workers de domínio.
- `src/features/cadence/**`: 17.
- contratos compartilhados e documentação de API: 18 dentro do escopo do próprio prompt.
- `.agents/prompts/**`: decisão humana.
- `.agents/runs/**`: somente 00.
- `.agents/verification/**`: 19.
- `server.ts`: mudança exige aprovação explícita do 00.
- `package.json` e lockfile: mudança exige aprovação explícita do 00.

Integração que precisa de schema abre handoff para 01/01A. Agente que não é dono de arquivo não resolve conflito editando o arquivo alheio.

## Segurança e higiene
Nunca commitar:
- `.env` real;
- token, chave, senha, cookie ou webhook secreto;
- `.git/`, `node_modules/`, `dist/` ou ambiente virtual;
- dump/backup de banco;
- log com segredo ou PII.

Manter apenas exemplos sanitizados. Nunca colocar segredo em fixture, screenshot, relatório, prompt, bug report ou mensagem de erro.

Achado conhecido: dumps antigos de prospecção continuam recuperáveis no histórico Git. A remoção do working tree não elimina a exposição histórica. Rotação de credenciais expostas e decisão de reescrita do histórico são checkpoints humanos, coordenados por 00/15. Agente nenhum executa force-push destrutivo sem autorização humana explícita.

## Dados reais x demonstração
- demo deve ser rotulada e isolada;
- produção/homologação não mistura valor inventado com KPI real;
- loading, empty, error e stale devem ser explícitos;
- nenhuma métrica comercial pode ser fabricada;
- nenhuma IA pode afirmar que executou ação que apenas recomendou.

## Tenancy AtlasGR / TotalTrac
Separação visual não prova isolamento.
Toda leitura/escrita sensível precisa comprovar tenant de origem, filtro no backend/data layer, autorização e teste cross-tenant. Vazamento cross-tenant é crítico e bloqueia fase/release.

## LGPD e dados pessoais
Todos os agentes tratam a fatia de LGPD do próprio domínio.

- 01/01A: RLS, criptografia, retenção, exclusão/anonimização e integridade de dados;
- 04: proveniência e exposição mínima em CRM/BI;
- 05: enriquecimento mínimo, origem e inferido vs confirmado;
- 06/06A: sincronização/exportação sem vazamento de tenant;
- 07/13: PII para IA apenas sob base legal/consentimento exigido pelo produto e sem mistura de tenant;
- 08: checklist de release e processo operacional do titular;
- 15: incidente, segredos e superfícies expostas;
- 17: opt-out e contato multicanal;
- 19: evidências de teste sem PII;
- 20: bug reports e screenshots sem PII real.

## Bloqueadores prioritários
Antes de adicionar escopo novo, eliminar ou provar resolvidos:
1. bypass/divergência de RBAC;
2. rota administrativa sem autorização adequada;
3. auth insegura;
4. credencial exposta ou não rotacionada após exposição;
5. deploy sem migration obrigatória;
6. dado fictício apresentado como real;
7. falso sucesso em navegação, integração, IA ou automação;
8. isolamento de tenant não comprovado;
9. sincronização Bitrix silenciosa/incompleta tratada como final;
10. obrigação LGPD sem caminho técnico/operacional;
11. dump/PII recuperável no histórico Git sem decisão e remediação registrada;
12. gate obrigatório incapaz de executar;
13. worker/runtime que possa parar ou duplicar processamento sem observabilidade;
14. release que publique artefato sem depender dos gates mandatórios.

## Seis fases finais
As ondas históricas permanecem como histórico. A finalização usa estas seis fases:

### Fase Final 0 - Segurança e Governança
Liderança: 00. Principais: 15, 01/01A, 18, 19. 20 faz smoke do reporter.
Objetivo: roster alinhado, P0 de segurança tratado, credenciais externas rotacionadas/verificadas quando depender de humano, decisão sobre histórico Git, governança e baseline confiável.

### Fase Final 1 - Gate Único de Release
Liderança técnica: 08. Principais: 14, 15, 18, 19.
Objetivo: um único caminho obrigatório de release com secret scan, lint, typecheck, unit, integration, E2E, migrations, build e verificações específicas sem `continue-on-error` indevido em gate crítico.

### Fase Final 2 - Runtime e Workers
Liderança: 16. Apoio: 00, 08, 10, 06, 04/13/17 conforme workers afetados, 19.
Objetivo: separar HTTP e processamento assíncrono sem perder jobs, eliminar cron duplicável, mover estado necessário para storage distribuído, graceful shutdown e cutover comprovado.

### Fase Final 3 - Resiliência e SRE
Liderança: 10. Apoio: 08, 01/01A, 15, 16, 19.
Objetivo: backup + restore provado, observabilidade, alertas, SLO/SLI, rollback executável, health/readiness reais, capacidade e testes de falha.

### Fase Final 4 - QA e Experiência Real
Liderança de produto: 20. Liderança técnica: 19/08/14. Apoio: 02, 03 e agentes de domínio sob demanda.
Objetivo: full sweep de 100% do inventário de módulos/rotas aplicáveis, bugs registrados pela UI, correção pelo dono, reteste 20 e gate 19. Zero Critical/High aberto em jornada obrigatória.

### Fase Final 5 - Go-Live Controlado
Liderança: 00 + 08 + 10. Verificação: 19. Experiência: 20 em smoke dirigido. 15 participa do security check final.
Objetivo: RC imutável, staging/homologação, migration, smoke, aprovação humana de produção, deploy, monitoramento, rollback pronto e evidência pós-deploy.

## Production Ready - gate binário
A porcentagem de readiness não substitui o gate.

Só declarar `PRODUCTION READY` quando, no mesmo estado de código candidato:
- P0 = 0;
- P1 = 0 ou formalmente reclassificado como não pertencente ao escopo do release com feature desabilitada e evidência;
- Agente 19 = `PASS`;
- Agente 08 = `RELEASE APPROVED`;
- Agente 20 = `PASS` nas jornadas obrigatórias;
- migrations = PASS;
- integration = PASS;
- E2E = PASS;
- auth/RBAC/tenant = PASS;
- security/secrets = PASS;
- Bitrix e integrações críticas do release = PASS;
- AI crítica do release = PASS;
- backup e restore = PASS;
- observabilidade/alertas/health = PASS;
- rollback = comprovado;
- ações externas obrigatórias de segurança = verificadas;
- aprovação humana do environment de produção = concedida.

Funcionalidade opcional incompleta não vira P1 automaticamente. Se não fizer parte do release, deve estar ausente/desabilitada/rotulada honestamente.

## Definição global de pronto
Uma tarefa só está concluída quando:
- causa raiz tratada;
- nenhum fallback/falso sucesso enganoso;
- erros observáveis;
- testes de caminho feliz e falha adequados;
- agente implementador executou validações locais;
- Agente 19 verificou e deu PASS;
- se houver impacto visível, Agente 20 fez targeted retest quando aplicável;
- documentação/contrato afetado atualizado;
- nenhuma regressão de segurança/tenant/LGPD;
- arquivos, comandos e resultados registrados.

## Proibição de auditoria passiva
Problema corrigível dentro do escopo deve ser corrigido. Backlog só para dependência externa, decisão de negócio ou arquivo de outro dono. Nesses casos, produzir handoff acionável.

## Regra de autonomia
Não interromper o usuário para decisão técnica rotineira.
Perguntar apenas quando faltar fato externo indisponível, credencial, autorização destrutiva, decisão comercial irreversível ou aprovação de produção.
