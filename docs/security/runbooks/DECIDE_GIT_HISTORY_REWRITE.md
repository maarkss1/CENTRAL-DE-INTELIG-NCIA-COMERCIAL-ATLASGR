# Runbook — Decisão sobre reescrever o histórico do git (`backups/prospector-*.dump`)

> **Atualizado em 2026-09-05: o Caminho B foi executado para `main`.** A narrativa abaixo (seções
> "Estado atual"/"Caminho A"/"Caminho B"/"Decisão humana registrada... 2026-08-16") é o registro
> histórico de como a decisão evoluiu até 18/08 — mantido intacto para contexto, mas **não reflete
> mais o estado atual**. Ver a seção "Decisão revista — Caminho B executado (2026-09-05)" mais
> abaixo para o que de fato aconteceu e o estado real de `main` hoje.

## Estado atual, verificado nesta onda

`backups/prospector-*.dump` **não está mais no working tree** (removido em commit anterior), mas
segue **recuperável no histórico** do repositório. **Reverificado na Sprint 01/Onda 13 (2026-08-18,
SEC-004)** via `git rev-list --objects --all | grep dump` + `git cat-file -s <blob>` + `git log
--all --oneline -- 'backups/*.dump'`, contra o HEAD atual de `main`: existe exatamente **um**
arquivo de dump em todo o histórico — `backups/prospector-20260806-152827.dump` (blob
`fbe6d831…`, 166075 bytes) — presente na árvore de 107 commits entre 2026-08-07 e 2026-08-11.

**Correção de registro (2ª vez que isso acontece — ver nota abaixo sobre `543c5b0`):** os hashes
`2e30b2f` (adição) e `8b1bc38` (remoção do rastreamento) citados em revisões anteriores deste
runbook e em `.agents/completion/01-bloqueadores.md` **não existem neste repositório**
(`git cat-file -e 2e30b2f`/`8b1bc38` falham com "Not a valid object name"). Os hashes reais: o blob
foi adicionado de forma duplicada em duas linhas de branch paralelas, ambas em 2026-08-07—
`9a9c9506` ("chore(deploy): provisiona Supabase... e prepara deploy automatico no Render") e
`40dd9478` ("fix(render): força instalação de devDependencies no build") — unidas no merge
`5467e2a8` (2026-08-11). Não há um commit `git rm` dedicado de remoção: o arquivo desaparece dentro
da resolução de um merge posterior (`3731ce04`), não como um commit isolado. Antes dela, o hash
`543c5b0`, citado em revisões ainda mais antigas deste runbook e em
`.agents/prompts/15-seguranca-aplicada.md`, também já havia sido reverificado e confirmado
inexistente. É um padrão real: hashes citados de onda em onda sem reverificação direta contra o
git tendem a ficar desatualizados/errados conforme o histórico segue avançando. Nada disso muda a
gravidade do achado (ainda é PII real, real e recuperável), só corrige a lista de commits que
qualquer `git filter-repo`/BFG precisaria mirar — dado pessoal real de prospecção (nome, telefone,
e-mail, empresa) sob a LGPD, não só higiene de repositório.

**Isso não é uma decisão que um agente de código pode tomar sozinho.** Reescrever histórico muda o
hash de todo commit descendente dos afetados, o que quebra qualquer clone, fork, PR aberto ou
branch local de outra pessoa que não fizer o mesmo rebase. Os dois caminhos abaixo têm custo real e
oposto — este runbook existe para que o dono do repositório escolha com o custo explícito na frente,
não para empurrar uma recomendação disfarçada de fato consumado.

## Caminho A — Manter o histórico como está (remediar só daqui pra frente)

**O que já foi feito:** arquivo removido do working tree, dump não é mais gravado/commitado
(assumindo `backups/` no `.gitignore` — verificar no Passo 0 abaixo).

**Custo/risco de escolher este caminho:**
- O dump com PII real continua permanentemente recuperável por qualquer clone existente ou futuro
  do repositório, incluindo forks já feitos antes da remoção — mesmo que o remote principal seja
  tornado privado depois, cópias já clonadas mantêm o histórico completo.
- Sob a LGPD, isso é um dado pessoal que a organização não consegue mais efetivamente "esquecer" —
  um pedido de exclusão de titular (Art. 18) sobre um registro que estava nesse dump não pode ser
  atendido de forma completa enquanto o commit existir em qualquer cópia acessível.
- Mitigação parcial possível sem reescrever histórico: tornar o repositório privado (se ainda não
  for) reduz a superfície de quem pode acessar o histórico a partir de agora, mas não desfaz
  clones/forks já existentes nem remove o dado do repositório principal.

**Vantagem:** zero risco de quebrar colaboração em andamento — nenhum PR aberto, fork ou clone
precisa de ação, hashes de commit permanecem estáveis, histórico de blame/log intacto.

## Caminho B — `git filter-repo` (ou BFG Repo-Cleaner) para remover definitivamente

**O que isso faz:** reescreve todo commit que toca `backups/*.dump`, removendo o arquivo do
histórico inteiro — os commits `9a9c9506` e `40dd9478` (que introduzem o blob em duas linhas de
branch paralelas), o merge `5467e2a8` (que as une) e todo commit descendente deles recebem
**hashes novos**.

**Custo/risco de escolher este caminho:**
- Qualquer branch local, fork ou PR aberto baseado no histórico antigo fica divergente — precisa
  ser re-clonado ou re-baseado manualmente por cada pessoa/agente com uma cópia. Neste repositório
  isso inclui, no mínimo, todos os worktrees de agente ativos no momento da reescrita
  (`../wt-agente-*`) e qualquer PR aberto contra branches afetadas.
- Exige `git push --force` na branch principal após a reescrita local — **proibido para qualquer
  agente por regra do próprio `AGENTS.md`** ("NEVER run destructive git commands... unless the
  user explicitly requests") e por política deste runbook: só o dono humano do repositório executa
  o force-push final, depois de coordenar a janela de reescrita com todos os colaboradores ativos.
- Tags e releases que referenciam os commits antigos por hash quebram; qualquer link/documentação
  externa apontando para um commit hash específico do intervalo afetado fica inválido.
- Mesmo depois da reescrita, cópias já clonadas **antes** da reescrita continuam contendo o dado
  antigo até serem descartadas/atualizadas — a reescrita não alcança o que já foi baixado por
  terceiros que tiveram acesso ao remote público antes da correção.

**Vantagem:** é o único caminho que efetivamente remove o dado do repositório principal e de
qualquer clone futuro, e é a única forma de responder de forma completa a uma eventual solicitação
de exclusão de titular sob a LGPD que dependa desse dado.

## Passo 0 — Pré-requisito, independente de qual caminho for escolhido

Confirme que `backups/` está no `.gitignore` para que o problema não se repita, e rode o script de
varredura local (`scripts/security/scan-secrets.sh`) para confirmar que nenhum `*.dump` novo está
staged/rastreado:

```bash
grep -n '^backups/' .gitignore || echo "AUSENTE — adicionar backups/ ao .gitignore (fora do escopo do Agente 15, ver handoff)"
git ls-files | grep -E '\.dump$' || echo "nenhum .dump rastreado no working tree atual"
```

Isso é escopo de higiene geral do repositório — se `.gitignore` não tiver a entrada, abra handoff
para o dono do arquivo (não é `docs/security/**`/`scripts/security/**`, portanto fora da
propriedade exclusiva do Agente 15 nesta onda).

## Passo 1 — Se o Caminho B for escolhido: procedimento

1. Coordenar com todos os donos de worktree/branch ativos — nenhum push/pull deve acontecer
   durante a janela de reescrita.
2. Em um clone dedicado (não em um worktree de agente em uso):
   ```bash
   git clone --mirror <url-do-repo> repo-mirror-for-cleanup
   cd repo-mirror-for-cleanup
   git filter-repo --path backups/ --invert-paths
   ```
3. Revisar o resultado (`git log --all --oneline -- backups/` deve retornar vazio) antes de
   qualquer push.
4. `git push --force --all` e `git push --force --tags` — **só o dono humano do repositório**,
   nunca um agente.
5. Cada colaborador/agente com clone/worktree existente descarta a cópia antiga e re-clona.

## Passo 2 — Verificação, para qualquer caminho escolhido

Depois de aplicado (Caminho A: só a mitigação de acesso; Caminho B: a reescrita), confirme:

```bash
# Caminho A: confirma que o repositório não aceita novo dump (regressão) — não confirma remoção
# do histórico existente, que é o próprio ponto do Caminho A.
scripts/security/scan-secrets.sh

# Caminho B: confirma que os commits antigos não existem mais no repositório reescrito.
git cat-file -e 9a9c9506 2>&1 && echo "AINDA PRESENTE — reescrita falhou" || echo "commit não encontrado — reescrita efetiva"
git cat-file -e 40dd9478 2>&1 && echo "AINDA PRESENTE — reescrita falhou" || echo "commit não encontrado — reescrita efetiva"
# Mais direto que confiar em hashes de commit específicos (que já erraram 2x neste runbook):
# confirma que o blob em si não existe mais em nenhum lugar do histórico reescrito.
git rev-list --objects --all | grep -i '\.dump$' && echo "AINDA PRESENTE" || echo "nenhum .dump em todo o histórico — reescrita efetiva"
```

## Recomendação registrada, sem decidir por conta própria

Dado que o dump contém PII real e o remote já foi público, o Caminho B é o único que atende
integralmente a obrigação de minimização/exclusão da LGPD sobre esse dado específico. O Agente 15
registra essa avaliação técnica, mas a decisão final — por envolver custo de coordenação
organizacional e reescrita de histórico compartilhado — é do dono do repositório, não deste
agente. Nenhuma ação do Caminho B foi executada nesta onda.

## Decisão humana registrada (Fase Final 0, 2026-08-16 — reafirmada na Sprint 01/Onda 13, 2026-08-18)

O dono do repositório escolheu explicitamente o **Caminho A** para esta fase (manter o histórico,
mitigar daqui pra frente) — nenhuma reescrita de histórico/force-push foi autorizada. Verificação do
Passo 0, feita pelo Agente 00 no mesmo estado (SHA `0d55a99`):

```
$ grep -n '^backups/' .gitignore
36:# versão (AGENTS.md → "Segurança e higiene", achado backups/prospector-*.dump).
37:backups/*.dump
$ git ls-files | grep -E '\.dump$'
(vazio — nenhum .dump rastreado no working tree atual)
```

Pré-requisito do Caminho A atendido: `backups/*.dump` está no `.gitignore` e nenhum novo dump está
rastreado. A exposição histórica do único dump real (commits `9a9c9506`/`40dd9478`, ver seção
acima) permanece um risco aceito e registrado, não resolvido — reabrir esta decisão exige nova
autorização humana explícita para o Caminho B, não uma reinterpretação por qualquer agente.

**Sprint 01/Onda 13 (SEC-004, 2026-08-18):** reverificação completa do achado (fatos do git, não
a decisão) — nenhum fato novo que mude a decisão. Caminho A continua em vigor. Única mudança desta
sprint: correção dos hashes de commit citados (ver topo deste arquivo) — a decisão em si (manter
histórico) não foi reaberta nem precisou ser.

## Decisão revista — Caminho B executado (2026-09-05)

O dono do repositório reabriu esta decisão e escolheu explicitamente o **Caminho B** para `main`
(reescrever, não só mitigar) — pedido feito na mesma sessão que também triou os 45 segredos
históricos do gitleaks (ver `docs/security/GITLEAKS_HISTORICAL_FINDINGS_2026-09-05.md`) e
encontrou uma chave real do Google Gemini exposta em `test-gemini.ts`/`test-gemini-quota.ts`. O
escopo foi ampliado a pedido do dono para incluir também `backups/prospector-20260806-152827.dump`
— o mesmo achado de PII documentado no restante deste runbook — já que "dado pessoal não se
rotaciona como uma chave".

**Execução, resumida** (procedimento completo seguiu os Passos 0-2 abaixo, com uma adaptação —
ver nota de escopo):

1. Clone `--mirror` isolado, `git filter-repo --path test-gemini.ts --path test-gemini-quota.ts
   --path backups/ --invert-paths --force`.
2. Verificado antes do push: `git rev-list --objects --all | grep -iE '\.dump$|test-gemini'` vazio
   no mirror reescrito.
3. Concorrência real detectada e tratada: 2 commits novos chegaram em `main` (`41082d2c`, `3903d943
   "Update launch.json"`) enquanto o mirror estava sendo preparado — o mirror foi re-clonado do
   zero e a filtragem refeita antes do push, em vez de arriscar perder esses commits. O mesmo se
   repetiu depois do merge do PR #350 (mais uma re-clonagem + refiltragem) — nenhum commit legítimo
   foi perdido.
4. `git push --force` para `refs/heads/main` (só essa ref, não `--mirror`/`--all`) — bloqueado
   duas vezes por proteção de branch do GitHub (`GH006`) até o dono desabilitar temporariamente
   "Allow force pushes" nas configurações da branch; reabilitada logo em seguida.
5. **Nota de escopo (diferença do Passo 1 original abaixo):** por ter sido feito via `clone
   --mirror` (necessário para capturar o dump, que só existia em commits antigos fora do alcance
   de um clone raso), o `filter-repo` reescreveu tecnicamente as 82 branches remotas do
   repositório, não só `main`. **Só `main` foi de fato force-pushada** — as outras 81 branches
   remotas continuaram apontando pros commits originais (não tocadas), por escolha explícita do
   dono (reduzir o raio de impacto: nenhum PR aberto na época dependia delas). Essas 81 branches
   foram deletadas do remote numa ação separada, posterior e independente desta reescrita (limpeza
   normal de branches antigas de "ondas" já finalizadas, não uma segunda rodada de
   `filter-repo`/force-push).

**Quem executou o quê:** a sessão automatizada preparou e verificou tudo (clone, filtragem,
validação, mirror pronto) — o `git push --force` final e a alteração temporária de proteção de
branch foram feitos pelo próprio dono do repositório, seguindo a regra deste runbook ("só o dono
humano executa o force-push final").

**Verificação pós-reescrita, contra o remote real:**
```
git ls-remote https://github.com/maarkss1/CENTRAL-DE-INTELIG-NCIA-COMERCIAL-ATLASGR refs/heads/main
# b5d47d1f94f500652873fdac21f5f13086723efc — hash novo, confirmado
```
`git rev-list --objects main` (sem `--all`) no worktree sincronizado com o `main` pós-reescrita não
retorna mais nenhum blob de `.dump`/`test-gemini*`.

### Observação técnica registrada (achado do dono do repositório, pós-reescrita)

Depois da reescrita, `git merge-base`/`git branch --merged` contra o `main` novo **não conseguem
mais confirmar** se as 81 branches antigas (não reescritas) "já estavam mergeadas" — seus commits
apontam para a linha de histórico **anterior** ao rewrite, que diverge completamente da nova a
partir do primeiro commit tocado pelo `filter-repo`. Isso não é regressão nem sinal de erro na
reescrita: é a consequência estrutural inevitável de qualquer `filter-repo`/BFG — hash muda, então
qualquer comparação de ancestralidade contra a nova linha não localiza mais um commit da linha
antiga, mergeado ou não. A verificação usada para decidir a limpeza dessas 81 branches (`git
merge-base --is-ancestor`) já rodou **antes** do force-push da `main`, contra o histórico ainda
original — não foi afetada por essa limitação, mas o dado deixou de ser reproduzível depois do
rewrite.

**Consequência prática, caso precise recuperar algo dessas 81 branches deletadas no futuro:** seu
conteúdo integral só existe hoje (a) na "lixeira" de branches do GitHub, se restaurada dentro da
janela que a plataforma mantém, ou (b) em qualquer clone local que alguém tenha feito **antes**
desta limpeza e que ainda preserve essas refs remotas localmente (`git branch -r`/`git reflog`
locais não afetados pelo `--prune`). Depois de expirada a janela de restauração do GitHub e sem
nenhum clone local remanescente, esse conteúdo deixa de ser recuperável por qualquer meio.
