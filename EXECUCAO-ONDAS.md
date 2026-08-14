# Execução Oficial em Ondas

## Onda 0 — Preparação
O Coordenador deve:
- verificar branch/working tree;
- ler `AGENTS.md`;
- verificar ausência de segredos;
- criar/atualizar a branch de integração `integracao/onda-1` a partir da branch principal;
- garantir que existem `.agents/runs/` e `.agents/handoffs/` (criar com `.gitkeep`/`README.md` se ausentes);
- levantar baseline com typecheck/lint/test/build;
- registrar falhas existentes em `.agents/runs/baseline.md`;
- impedir que baseline quebrado seja confundido com regressão nova.

## Onda 1 — Fundação
Paralelo, cada um em branch/worktree próprio (`agente/01-plataforma-dados`, `agente/02-produto-ux`, `agente/06-integracoes-bitrix`), todas a partir de `integracao/onda-1`, respeitando `/AGENTS.md` → "Regra de concorrência":
- 01 Plataforma, Segurança e Dados
- 02 Produto e UX
- 06 Integrações e Bitrix

### Antes do gate
- revisar `.agents/handoffs/onda-1/**` com `Status: aberto` e `Prioridade: bloqueador`;
- fazer merge de cada branch aprovada em `integracao/onda-1`.

### Gate (rodar na branch de integração)
```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e
npm run verify:integrations
npm run build
```

### Não avançar se existir
- bypass de RBAC;
- cross-tenant;
- segredo exposto;
- dashboard falso;
- Bitrix silencioso;
- voz com falso sucesso;
- Extrações Bitrix tratadas como prontas sem passar critérios;
- handoff bloqueador aberto sem resolução nem justificativa registrada.

## Onda 2 — Operação comercial
Paralelo, cada um em branch/worktree próprio (`agente/04-crm-bi`, `agente/05-prospeccao`, `agente/07-ia-automacoes`), todas a partir de `integracao/onda-2` (criada a partir de `integracao/onda-1` já aprovada), respeitando `/AGENTS.md` → "Regra de concorrência":
- 04 CRM e BI
- 05 Prospecção
- 07 IA e Automações

### Antes do gate
- revisar `.agents/handoffs/onda-2/**` com `Status: aberto` e `Prioridade: bloqueador`;
- fazer merge de cada branch aprovada em `integracao/onda-2`.

### Gate (rodar na branch de integração)
```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e
npm run verify:integrations
npm run verify:ai
npm run build
```

### Não avançar se existir
- forecast sem rastreabilidade;
- owners fictícios;
- provider com erro silencioso;
- RAG cross-tenant;
- ferramenta de IA inacessível;
- automação sem histórico/status;
- dado pessoal enviado a IA sem consentimento registrado.

## Onda 3 — Acabamento e release
Paralelo, branch/worktree próprio a partir de `integracao/onda-3` (criada a partir de `integracao/onda-2` já aprovada):
- 03 Design e Acessibilidade
- 08 QA e Release
- 1 agente anterior por vez para correções apontadas por QA (branch de remediação nomeada `agente/<numero>-remediacao-onda3`)

### Antes do gate final
- revisar `.agents/handoffs/onda-3/**` — nenhum item `Prioridade: bloqueador` pode seguir `aberto`;
- fazer merge de cada branch aprovada em `integracao/onda-3`.

### Gate final (rodar na branch de integração)
```bash
npx tsc --noEmit
npm run lint
npm run test
npm run verify:integrations
npm run verify:ai
npm run build
```

A decisão final é binária:
- RELEASE APPROVED
- RELEASE BLOCKED

Não existe "aprovado com teste não executado".

Após RELEASE APPROVED, o Coordenador integra `integracao/onda-3` na branch principal do projeto e remove os worktrees temporários das três ondas.

## Onda 4 — Extensões (Mobile, Infraestrutura, Marca)
Paralelo, cada um em branch/worktree próprio (`agente/09-mobile`, `agente/10-infraestrutura-sre`, `agente/11-marca-institucional`), a partir de `integracao/onda-4` (criada a partir de `main`/`develop` já com a Onda 3 integrada), respeitando `/AGENTS.md` → "Regra de concorrência":
- 09 Mobile (Capacitor/Android)
- 10 Infraestrutura, Observabilidade e SRE
- 11 Marca e Ativos Institucionais

Estes três agentes têm escopo de arquivos isolado entre si e das ondas anteriores — não dependem de bloqueador das Ondas 1–3 para começar. O Coordenador pode antecipar a Onda 4 (rodá-la em vez da Onda 3, ou entre as ondas) se houver prioridade de negócio, desde que a regra de concorrência de `/AGENTS.md` (teto de simultâneos, propriedade disjunta verificada antes de disparar e gate por leva de 2–3 merges) continue valendo no total.

### Antes do gate
- revisar `.agents/handoffs/onda-4/**` com `Status: aberto` e `Prioridade: bloqueador`;
- fazer merge de cada branch aprovada em `integracao/onda-4`.

### Gate (rodar na branch de integração)
```bash
npx tsc --noEmit
npm run lint
npm run build
```

Mais os comandos específicos de cada agente (build Android do 09, validação de manifests do 10) descritos em seus respectivos prompts.

### Não avançar se existir
- app mobile afirmando suportar recurso que não funciona no dispositivo;
- permissão Android solicitada sem uso funcional correspondente;
- segredo em manifest/chart/values versionado;
- ativo de marca referenciado pelo código removido/renomeado sem atualização de quem o consome;
- conteúdo institucional expondo dado sensível real.
