# AGENTS.md — Governança Global de Agentes

## Projeto
CENTRAL-DE-INTELIGENCIA-COMECIAL-ATLASGR

Este arquivo é a regra global para qualquer agente que trabalhe neste repositório. Regras locais em `AGENTS.md` dentro de subpastas refinam o escopo, mas nunca anulam as regras de segurança, qualidade e coordenação deste arquivo. Em caso de conflito entre um `AGENTS.md` local e este arquivo, este arquivo vence.

## Estrutura oficial de agentes
- 00 — Coordenador
- 01 — Plataforma, Segurança e Dados
- 02 — Produto e UX
- 03 — Design e Acessibilidade
- 04 — CRM e BI
- 05 — Prospecção
- 06 — Integrações e Bitrix
- 06A — Extrações Bitrix (especialista interno do 06, mesmo slot)
- 07 — IA e Automações
- 08 — QA e Release
- 09 — Mobile (Capacitor/Android)
- 10 — Infraestrutura, Observabilidade e SRE
- 11 — Marca e Ativos Institucionais
- 12 — Voz e Telefonia (Birthub Voices)

Prompts: `.agents/prompts/`. Nenhum agente edita o próprio prompt ou o prompt de outro agente durante a execução — mudança de prompt é decisão humana, fora do ciclo de ondas.

Os agentes 09, 10 e 11 foram adicionados depois da primeira instalação do pacote, ao identificar pastas reais do repositório (`android/`, `k8s/`+`argocd/`+`charts/`+`infrastructure/`, `identidade-visual/`+`documentacao-aplicacao/`) sem dono explícito. Ver `Onda 4` abaixo.

## Regra de concorrência
O coordenador ocupa 1 slot. No máximo 3 especialistas podem executar simultaneamente, em qualquer onda.

Nunca iniciar 4 especialistas ao mesmo tempo.

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

Escopo isolado entre si (pastas diferentes), mas ainda assim respeitando o limite de 3 especialistas simultâneos e o isolamento por worktree/branch (`agente/09-mobile`, `agente/10-infraestrutura-sre`, `agente/11-marca-institucional`, a partir de `integracao/onda-4`).

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
3. faz merge de cada branch aprovada em `integracao/onda-<n>`;
4. roda o gate da onda **na branch de integração**, não apenas nas branches individuais — um gate verde em cada branch isolada não garante ausência de conflito semântico entre elas;
5. se o gate da integração falhar após um merge específico, isola qual merge introduziu a falha, reverte esse merge e devolve ao agente dono com reprodução;
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

**Achado conhecido, ainda não remediado:** `backups/prospector-*.dump` está versionado no git deste repositório, violando a regra acima. Contém dump de banco com dado pessoal real de prospecção. Ação recomendada, em ordem: (1) `git rm --cached backups/*.dump` e adicionar `backups/` ao `.gitignore` — remove do próximo commit, não do histórico; (2) avaliar com o Agente 01 se algum segredo/credencial estava embutido no dump e rotacionar se necessário; (3) decidir com o dono do repositório se vale a pena reescrever o histórico (`git filter-repo`/BFG) para remover definitivamente — isso reescreve hashes de commit e exige coordenação se o repositório é compartilhado/já tem PRs abertos, portanto é decisão humana, não automática de agente.

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
