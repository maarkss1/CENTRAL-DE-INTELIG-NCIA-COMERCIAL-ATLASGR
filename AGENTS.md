# AGENTS.md — Governança Global de Agentes

## Projeto
CENTRAL-DE-INTELIGENCIA-COMECIAL-ATLASGR

Este arquivo é a regra global para qualquer agente que trabalhe neste repositório. Regras locais em `AGENTS.md` dentro de subpastas refinam o escopo, mas nunca anulam as regras de segurança, qualidade e coordenação deste arquivo. Em caso de conflito entre um `AGENTS.md` local e este arquivo, este arquivo vence.

## Estrutura oficial de agentes

Este é o roster real e completo — qualquer relatório, handoff ou onda que cite um agente fora desta
lista está referenciando algo que não existe na estrutura atual (ver "Agentes 19/20", abaixo).

- 00 — Coordenador
- 01 — Plataforma, Segurança e Dados
- 01A — Confiabilidade de Dados, RLS e Retenção (especialista interno do 01, **mesmo slot**: 01 e
  01A nunca rodam ao mesmo tempo, porque `prisma/schema.prisma` e `prisma/migrations/**` têm dono
  exclusivo e dois agentes editando schema em paralelo corrompe a onda)
- 02 — Produto e UX
- 03 — Design e Acessibilidade
- 04 — CRM e BI
- 05 — Prospecção
- 06 — Integrações e Bitrix
- 06A — Extrações Bitrix (especialista interno do 06, **mesmo slot**: 06 e 06A nunca rodam ao mesmo
  tempo, pelo mesmo motivo que 01/01A)
- 07 — IA e Automações
- 08 — QA e Release
- 09 — Mobile (Capacitor/Android)
- 10 — Infraestrutura, Observabilidade e SRE
- 11 — Marca e Ativos Institucionais
- 12 — Voz e Telefonia (Birthub Voices)
- 13 — Enxame Autônomo e Governança de Agentes de Runtime (agentes de IA que o cliente usa —
  Supervisor/SDR/BDR/Closer/CRM/Ops/Learning, scheduler 24/7, `AIPendingAction`, guardrails de PII;
  não confundir com os agentes de desenvolvimento 00-18 deste arquivo)
- 14 — Ambiente de Execução e Test Harness (mantém o gate obrigatório executável de verdade e
  estável entre execuções)
- 15 — Segurança Aplicada e Rotação de Segredos
- 16 — Runtime, Workers e Escala (filas BullMQ, cron, agendadores, ciclo de vida do processo)
- 17 — Cadência Multicanal e Ciclo de Receita
- 18 — Contratos, API e Documentação Viva (OpenAPI, paridade de tipos backend/frontend)

Prompts: `.agents/prompts/`. Nenhum agente edita o próprio prompt ou o prompt de outro agente durante a execução — mudança de prompt é decisão humana, fora do ciclo de ondas.

Os agentes 09, 10 e 11 foram adicionados depois da primeira instalação do pacote, ao identificar pastas reais do repositório (`android/`, `k8s/`+`argocd/`+`charts/`+`infrastructure/`, `identidade-visual/`+`documentacao-aplicacao/`) sem dono explícito. Ver `Onda 4` abaixo. Os agentes 13-18 foram adicionados depois disso, quando o programa passou a cobrir o Enxame autônomo, o harness de teste, segurança aplicada, runtime/workers, cadência de receita e contratos de API como domínios com dono próprio.

### Agentes 19/20 — não existem, não usar

Relatórios de "Fase Final" anteriores a esta onda (`.agents/runs/final-fase-0.md` a `final-fase-4.md`)
citam repetidamente "Agente 19 — Verificação Contínua" e "Agente 20 — Experiência Real/smoke". Esses
dois números **nunca foram formalizados neste roster** e não devem ser referenciados como agentes
ativos daqui em diante — qualquer prompt, handoff ou relatório novo que precise desses papéis usa a
atribuição abaixo:

- **Verificação contínua** (o gate técnico completo — typecheck/lint/unit/integration/E2E/build/
  secret-scan/npm audit/`verify:integrations`/`verify:ai`, sempre com evidência real e nunca herdado
  por suposição) é responsabilidade conjunta de **14** (dono do harness que faz o gate ser executável)
  **+ 08** (dono do critério de release e do veredito PASS/BLOCKED).
- **Experiência real** (jornada de usuário ponta a ponta — login real, navegação real, formulários
  reais, estados vazio/erro/loading, captura de tela, mobile) é responsabilidade conjunta de **02**
  (produto/UX dono do fluxo) **+ 03** (acessibilidade/design) **+ 08** (critério de release) **+ 14**
  (harness que sobe o ambiente real para o smoke rodar).

Ressalva registrada, não resolvida por esta onda: o antigo Agente 20 também cobria dois pontos que
não estão claramente em nenhum dos quatro perfis acima — (a) confirmar a persistência de uma ação de
UI **diretamente no banco**, não só na tela, e (b) confirmar que dado sensível/PII foi sanitizado
ponta a ponta em produção real. Até isso ganhar dono explícito, tratar como responsabilidade
compartilhada de **01/01A** (dados) na dimensão (a) e **15** (segurança aplicada) na dimensão (b),
acionados por 08 quando o release em questão tocar dado sensível.

## Regra de concorrência

O Coordenador ocupa 1 slot. Podem executar simultaneamente até **8 especialistas**.

O limite anterior era de 3 simultâneos. Ele foi revisado porque o histórico executado deste
repositório (`.agents/runs/onda-1.md` a `onda-5.md`) mostra que **nenhuma falha real de execução foi
causada pela quantidade de agentes**:

- o único conflito de merge de toda a história (`src/lib/queue/bitrixSync.worker.ts`, Onda 5) foi
  **sobreposição de propriedade** entre 06 (sync Bitrix) e 07 (métricas de fila), não concorrência —
  teria acontecido com 2 agentes;
- o incidente mais caro (Onda 1, 16 commits cherry-picked um a um em vez de merge de branch) foi
  corrida do Coordenador com outra sessão sobre um checkout compartilhado — falha de isolamento, não
  de contagem;
- a primeira tentativa da Onda 1 falhou nos 3 agentes por **limite de sessão da conta**, e não por
  disputa entre eles.

O que de fato escala mal não é o número de agentes trabalhando em paralelo: é o número de **merges
acumulados sem gate**. Quando o gate da branch de integração fica vermelho, este arquivo exige
isolar qual merge introduziu a falha e revertê-lo — e esse custo de bisect cresce mais que
linearmente. Por isso o teto passa a ser aplicado ao ponto certo do processo.

Rodar mais de 3 especialistas simultâneos exige **todas** as condições abaixo. Falhou uma, reduza N:

1. **Isolamento.** Cada especialista em `git worktree` + branch própria (ver "Isolamento de execução"
   abaixo). Compartilhar working tree continua proibido em qualquer N.
2. **Propriedade disjunta, verificada antes de disparar.** O Coordenador cruza os arquivos sob
   propriedade dos agentes ativos e publica a matriz de propriedade da onda em
   `.agents/runs/onda-<n>.md` **antes** do primeiro agente começar. Sobreposição encontrada é
   resolvida no papel — um dos agentes cede aquele arquivo e recebe o resultado por handoff. Não
   descobrir a sobreposição no merge.
3. **Gate por leva.** O Coordenador integra e roda o gate completo a cada **2–3 merges**, nunca
   acumulando todos os merges da onda para um único gate no fim. Um gate verde em cada branch isolada
   não prova ausência de conflito semântico entre elas — a Onda 5 provou isso na prática (falha de
   RLS do `AILog` só apareceu no gate da integração).
4. **Sem bloqueador mútuo.** Nenhum par de agentes ativos depende de um handoff `Prioridade:
   bloqueador` em aberto direcionado ao outro.
5. **Dono único para arquivo compartilhado.** `server.ts`, `package.json`/lockfile e
   `prisma/schema.prisma` mantêm dono único por onda, conforme "Propriedade exclusiva de arquivos".
   Quem precisar deles abre handoff — não edita.
6. **Capacidade real da ferramenta.** Se o ambiente de execução não sustentar N worktrees
   simultâneos, ou se a conta tiver limite de sessão/token que derrube agentes no meio da missão,
   reduza N até caber. Agente derrubado no meio da missão custa mais que agente que esperou a vez.

Ao subir de 3 para um número maior pela primeira vez num repositório ou ferramenta nova, prefira
validar o salto com um passo de cada vez (3 → 4 → 6) em vez de ir direto ao teto.

### Onda 1 — Fundação
Executar em paralelo:
1. Agente 01 — Plataforma, Segurança e Dados
2. Agente 02 — Produto e UX
3. Agente 06 — Integrações e Bitrix

### Onda 2 — Operação Comercial
Executar em paralelo:
1. Agente 04 — CRM e BI
2. Agente 05 — Prospecção
3. Agente 07 — IA e Automações

### Onda 3 — Acabamento
Executar em paralelo:
1. Agente 03 — Design e Acessibilidade
2. Agente 08 — QA e Release
3. Um agente anterior por vez para remediações apontadas por QA

### Onda 4 — Extensões (Mobile, Infraestrutura, Marca)
Executar em paralelo, depois de `RELEASE APPROVED` na Onda 3 (ou antes, se o Coordenador decidir que uma dessas frentes é prioridade de negócio — nenhuma delas depende de bloqueador das Ondas 1–3):
1. Agente 09 — Mobile (Capacitor/Android)
2. Agente 10 — Infraestrutura, Observabilidade e SRE
3. Agente 11 — Marca e Ativos Institucionais

Escopo isolado entre si (pastas diferentes), mas ainda assim respeitando a regra de concorrência acima e o isolamento por worktree/branch (`agente/09-mobile`, `agente/10-infraestrutura-sre`, `agente/11-marca-institucional`, a partir de `integracao/onda-4`).

## Isolamento de execução (git worktree)

Agentes rodando "em paralelo" nunca podem compartilhar o mesmo working tree. Edição simultânea no mesmo checkout corrompe o trabalho uns dos outros mesmo sem conflito de merge (arquivos meio escritos, index inconsistente, testes lendo estado de outro agente).

Antes de iniciar uma onda, o Coordenador:
1. cria/atualiza a branch de integração da onda: `integracao/onda-<n>`, a partir da última onda aprovada (ou de `main`/`develop` na Onda 1);
2. cria uma branch por especialista ativo a partir dessa branch de integração: `agente/<numero>-<slug>`, por exemplo `agente/01-plataforma-dados`;
3. cria um `git worktree` dedicado por especialista ativo, apontando para a branch dele, por exemplo `git worktree add ../wt-agente-01 agente/01-plataforma-dados`;
4. entrega a cada especialista apenas o caminho do seu próprio worktree — nunca o worktree de outro agente.

Cada especialista:
- trabalha exclusivamente dentro do seu worktree;
- commita em commits pequenos e coerentes, prefixados com o próprio id: `feat(01): ...`, `fix(06): ...`, `test(05): ...`;
- nunca faz `git push --force` nem reescreve histórico compartilhado;
- ao concluir sua missão da onda (ou ao atingir um ponto seguro de handoff), roda o próprio gate local no seu worktree antes de sinalizar pronto para integração.

O Coordenador, ao final (ou durante) da onda:
1. revisa o `git diff` de cada branch de especialista;
2. confirma que nenhum arquivo fora do escopo/propriedade do especialista foi tocado;
3. faz merge de cada branch aprovada em `integracao/onda-<n>`, **em levas de 2–3 merges** (ver "Regra de concorrência" → condição 3), nunca acumulando a onda inteira para uma única integração;
4. roda o gate da onda **na branch de integração** ao fim de cada leva, não apenas nas branches individuais — um gate verde em cada branch isolada não garante ausência de conflito semântico entre elas;
5. se o gate da integração falhar após um merge específico, isola qual merge introduziu a falha, reverte esse merge e devolve ao agente dono com reprodução — é justamente para manter esse bisect barato que a leva é limitada a 2–3 merges;
6. remove os worktrees temporários (`git worktree remove`) após a onda ser aprovada, preservando as branches até o merge final na branch principal do projeto.

Se a ferramenta/ambiente de execução não suportar múltiplos worktrees simultâneos, os especialistas da onda devem rodar em série (um de cada vez, cada um fazendo commit e integrando antes do próximo começar) em vez de dividir um único working tree ao vivo. Concorrência sem isolamento nunca é aceitável.

## Protocolo de handoff

Handoff nunca é apenas texto solto na saída do agente — é um artefato rastreável.

Formato: um arquivo por handoff em `.agents/handoffs/onda-<n>/<de>-para-<para>-<slug>.md`, por exemplo `.agents/handoffs/onda-1/06-para-01-schema-extracoes-bitrix.md`, contendo:
```markdown
- De: <agente origem>
- Para: <agente destino>
- Onda: <n>
- Status: aberto | em-andamento | resolvido
- Prioridade: bloqueador | alto | normal
## Problema
## Arquivo(s) envolvido(s)
## Alteração necessária
## Teste esperado
## Contexto adicional
```

Regras:
- qualquer agente pode criar seu próprio arquivo de handoff dentro de `.agents/handoffs/**`;
- um agente não edita o handoff criado por outro agente, exceto para atualizar o campo `Status` quando ele é o destinatário que resolveu o item (adicionar uma seção `## Resolução` abaixo, nunca apagar o pedido original);
- o Coordenador não aprova uma onda com handoff `Status: aberto` marcado como `Prioridade: bloqueador` direcionado a um bloqueador da lista abaixo;
- handoffs não bloqueadores podem transitar para a onda seguinte, desde que registrados no relatório da onda.

## Scripts ausentes

Antes de rodar qualquer `npm run <script>` de um gate, o agente verifica se o script existe em `package.json` → `scripts`. Se não existir:
- não trate como sucesso silencioso e não pule a linha sem registro;
- registre explicitamente na evidência: "script `<nome>` inexistente em package.json — gate não aplicável nesta execução";
- se o script deveria existir para o domínio do agente (ex.: `verify:integrations` ausente enquanto 06 mexe em integrações), abra handoff para 08 propondo a criação do script, com prioridade alto.

## Bloqueadores prioritários
Antes de adicionar novas funcionalidades, eliminar ou validar como resolvidos:
1. RBAC duplicado ou divergente.
2. Rotas administrativas autenticadas sem autorização por cargo/permissão.
3. Risco conhecido ou dependência insegura no sistema de autenticação.
4. Credenciais armazenadas sem proteção adequada.
5. Deploy capaz de iniciar sem aplicar migrações.
6. Dados fictícios misturados a dados reais no dashboard.
7. Comando de voz que afirma navegar sem realizar navegação.
8. Ferramentas do Hub de IA inacessíveis.
9. Erros de frontend em Integrações, incluindo estado/importações ausentes.
10. Separação visual AtlasGR/TotalTrac sem isolamento de dados comprovado.
11. Sincronizações Bitrix que podem falhar silenciosamente.
12. Extrações Bitrix incompletas tratadas como recurso final.
13. Tratamento de dados pessoais sem base legal, retenção definida ou meio de exclusão (ver seção LGPD).
14. Dump/backup de banco versionado no git (ex.: arquivos em `backups/**`). Isso já foi encontrado neste repositório — ver `/AGENTS.md` → "Segurança e higiene" e tratar como bloqueador imediato, não como item de backlog.

## Freeze de escopo (Sprint 00 → Sprint 13)

Decisão de governança da Sprint 00/Onda 12 (GOV-003), vigente até a Sprint 13:

- **Bloqueado**: qualquer feature nova fora do que já está listado como necessário para cumprir uma
  promessa já feita ao usuário/produto (ver `docs/`, `AUTONOMIA_COMERCIAL_24X7.md`,
  `PRODUCT_EXPERIENCE_CENTRAL_ATLASGR.md` e handoffs abertos com sprint destino "onda-13" no
  inventário de `.agents/handoffs/**`, consolidado em `.agents/runs/onda-12.md`).
- **Permitido**:
  - remediação de bug, débito técnico, achado de segurança/RBAC/tenancy/LGPD (ver "Bloqueadores
    prioritários" acima);
  - trabalho já em andamento que fecha uma promessa existente (ex.: as seis "Fases Finais" citadas
    em `.agents/runs/final-fase-0.md` a `final-fase-4.md`, e a Fase Final 5/Go-Live ainda pendente);
  - correção de drift entre o que o produto diz que faz e o que o código realmente faz.
- Qualquer agente que identificar uma ideia de feature nova fora desse critério durante o freeze
  registra em handoff com sprint destino "pós-Sprint 13" em vez de implementar — não é decisão do
  agente decidir que uma feature é urgente o suficiente para furar o freeze.
- O Coordenador (00) é quem decide se algo é "remediação"/"promessa já existente" ou "feature nova"
  em caso de dúvida, e registra a decisão no relatório da onda em questão.

## Regra de autonomia
Não interromper o usuário para decisões técnicas rotineiras.

Quando houver um problema solucionável no repositório:
1. Reproduzir.
2. Identificar causa raiz.
3. Corrigir no escopo do agente responsável.
4. Adicionar ou atualizar testes.
5. Executar validações.
6. Registrar evidências.
7. Solicitar ao coordenador somente alterações que pertençam a outro dono.

Perguntas ao usuário são último recurso e apenas para fatos externos realmente indisponíveis, como credenciais, decisões comerciais irreversíveis ou permissões de produção.

## Propriedade exclusiva de arquivos
- `prisma/schema.prisma`: somente Agente 01.
- Migrações Prisma: somente Agente 01 cria/edita.
- `src/App.tsx`, navegação principal e Sidebar: somente Agente 02.
- Pipelines de CI (`.github/workflows/**`), `Dockerfile` e `docker-compose.yml` da raiz: somente Agente 08.
- `k8s/**`, `argocd/**`, `charts/**`, `infrastructure/**`: somente Agente 10.
- `android/**` e `capacitor.config.ts`: somente Agente 09.
- `identidade-visual/**` e `documentacao-aplicacao/**`: somente Agente 11.
- `server.ts`: alteração exige aprovação explícita do Agente 00.
- `package.json` e lockfile: alteração exige aprovação explícita do Agente 00.
- `.agents/prompts/**`: nenhum especialista edita; mudança de prompt é decisão humana fora do ciclo de execução.
- `.agents/runs/**`: escrito pelo Coordenador; especialistas apenas leem.
- `.agents/handoffs/**`: qualquer agente cria seus próprios arquivos; não edita handoff alheio (ver Protocolo de handoff).
- Integrações não criam migrações. Devem abrir solicitação técnica para o Agente 01.
- Agentes não devem reformatar ou editar arquivos fora do próprio escopo sem necessidade comprovada.

## Regras de conflito
1. O agente que não é dono do arquivo não faz a alteração.
2. Produza um handoff curto com: problema, arquivo, alteração necessária, teste esperado (ver Protocolo de handoff).
3. O coordenador encaminha ao dono.
4. Mudanças cross-domain devem ter contrato de interface antes da edição.
5. Nunca resolver conflito apagando a mudança de outro agente.

## Segurança e higiene
Nunca commitar ou copiar para pacote:
- `.env` real;
- tokens, chaves, senhas, cookies ou webhooks secretos;
- `.git/`;
- `node_modules/`;
- `dist/`;
- ambientes virtuais;
- dumps e backups de banco;
- logs contendo dados sensíveis.

Manter apenas exemplos sanitizados, como `.env.example`.

Nunca colocar segredos em fixtures, screenshots, relatórios, prompts ou mensagens de erro.

Antes de finalizar qualquer onda, rodar varredura de segredo versionado (ferramenta disponível no projeto, por exemplo `gitleaks`/`trufflehog`, ou busca manual por padrões de chave/token) sobre o diff acumulado da onda. Achado positivo é bloqueador — ver protocolo em 08 e regra de credenciais em 01.

**Achado conhecido, parcialmente remediado:** `backups/prospector-*.dump` chegou a ser versionado no git deste repositório, violando a regra acima, com dado pessoal real de prospecção. Estado atual (verificado nesta onda, Sprint 00/Onda 12 — GOV-002): o arquivo **já foi removido do working tree atual** (`git ls-files` não retorna nenhum `.dump`; `backups/` só contém `AGENTS.md`) e `.gitignore` cobre `backups/*.dump`, `*.sql`, `*.backup`, `*.tar`, `*.tar.gz` e `*.gz`, então não há reincidência silenciosa. Isso **não** significa que o dado desapareceu: **o histórico do git continua recuperável** — o arquivo ainda existe nos commits antigos para quem tiver acesso ao repositório e souber navegar o histórico, então o risco de exposição de dado pessoal não está eliminado, só contido no HEAD. Pendências reais, nesta ordem: (1) confirmar com o Agente 01 se algum segredo/credencial estava embutido no dump e rotacionar se ainda não foi feito; (2) decidir com o dono do repositório se vale reescrever o histórico (`git filter-repo`/BFG) para remover definitivamente — isso reescreve hashes de commit e exige coordenação com PRs abertos, portanto continua sendo **decisão humana separada, não automática de agente**, e não é aprovada nem rejeitada por esta onda.

## Dados reais x demonstração
- Dados de demonstração devem ser explicitamente rotulados e isolados.
- Produção e homologação não podem misturar valores inventados com indicadores reais.
- Dashboards devem apresentar loading, empty, error e stale state de forma explícita.
- Nenhuma métrica comercial pode ser fabricada para "preencher" a interface.

## Tenancy AtlasGR / TotalTrac
Separação visual não é prova de isolamento.

Toda leitura e escrita de dados sensíveis a empresa/tenant deve comprovar:
- origem do tenant;
- filtro aplicado no backend/data layer;
- autorização;
- testes de acesso cruzado;
- comportamento de fallback seguro.

## LGPD e dados pessoais

A plataforma processa dados pessoais reais de leads, contatos e clientes (nome, telefone, e-mail, cargo, empresa, e em alguns casos dados enriquecidos por terceiros). A Lei Geral de Proteção de Dados (Lei 13.709/2018) se aplica integralmente, mesmo em ambiente de homologação com dados reais.

Regra geral, válida para todos os agentes:
- nunca armazenar mais dado pessoal do que o necessário para a finalidade comercial declarada (minimização);
- nunca criar novo destino de armazenamento/replicação de dado pessoal (planilha paralela, cache não governado, log persistente) sem que ele herde as mesmas proteções de tenant, retenção e auditoria dos dados de origem;
- todo dado pessoal deve ser rastreável a uma origem e, quando obtido por enriquecimento/terceiro, à base legal e ao fornecedor.

Responsabilidade por domínio:
- **01** garante controle de acesso, criptografia/mascaramento de credenciais e mecanismo técnico de exclusão/anonimização de dado pessoal mediante solicitação;
- **04** garante que campos comerciais com dado pessoal tenham dono, proveniência e não sejam expostos além do necessário em relatórios agregados;
- **05** garante proveniência, rotulagem de dado inferido vs. confirmado e não enriquece além do estritamente necessário para qualificação comercial;
- **06/06A** garante que extrações e sincronizações não dupliquem dado pessoal fora do tenant de origem e que exportações (CSV/XLSX/JSON) não vazem entre organizações;
- **07** garante que dado pessoal enviado a provedores de IA externos só ocorre com consentimento explícito registrado e nunca mistura tenants no contexto enviado ao modelo;
- **08** garante, na checklist de release, que existe caminho operacional para atender solicitação de titular (acesso, correção, exclusão) e que isso está documentado.

Nenhum agente deve tratar este tema como "fora de escopo" — cada um trata a fatia que lhe cabe dentro da própria missão de onda.

## Gate obrigatório por onda
A onda não termina sem:
```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
```

Quando aplicável:
```bash
npm run verify:integrations
npm run verify:ai
```

Ver seção "Scripts ausentes" para o caso de script não existir.

Não marcar teste como "aprovado" se não foi executado. Corrigir ambiente/teste até conseguir evidência, salvo dependência externa impossível de provisionar localmente. Nesse caso, o coordenador deve registrar o bloqueio como impeditivo de release, nunca como sucesso.

## Definição global de pronto
Uma tarefa só está concluída quando:
- causa raiz foi tratada;
- não existe fallback enganoso;
- erros relevantes ficam visíveis/observáveis;
- testes cobrem caminho feliz e falha;
- typecheck, lint e build permanecem verdes;
- documentação afetada foi atualizada;
- nenhuma regressão de segurança/tenancy foi introduzida;
- nenhuma obrigação de LGPD conhecida foi ignorada dentro do escopo do agente;
- o agente fornece arquivos alterados, comandos executados e resultados.

## Proibição de "auditoria sem correção"
Encontrou problema corrigível? Corrija agora dentro do escopo.

Backlog só é aceitável para dependências externas, decisões de negócio ou mudanças que exigem dono diferente. Mesmo nesses casos, produzir handoff acionável.
