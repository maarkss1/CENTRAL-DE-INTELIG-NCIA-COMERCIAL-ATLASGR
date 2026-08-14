- De: Agente 00 (Coordenador)
- Para: Agente 08 (QA e Release)
- Onda: 2.5
- Status: resolvido
- Prioridade: alto

## Problema
Ao abrir os PRs especialistas da Onda 2.5, o workflow `SonarQube Analysis` falha no step `Set up job`, antes de checkout/análise. A anotação do GitHub informa que o repositório exige GitHub Actions fixadas em SHA completa, mas o workflow ainda referencia actions por tag/branch:

- `actions/checkout@v4`
- `actions/setup-node@v4`
- `sonarsource/sonarqube-scan-action@master`

Mensagem observada no PR #104 / run 31762597572:
`all actions must be pinned to a full-length commit SHA`.

Os PRs #105 e #106 também dispararam o mesmo workflow e concluíram com failure, consistente com o bloqueio de configuração compartilhado.

## Arquivo(s) envolvido(s)
- `.github/workflows/**` do workflow `SonarQube Analysis`.

## Alteração necessária
Substituir referências mutáveis por SHAs completas e confiáveis das releases escolhidas, preservando comentários com a versão humana quando útil. Não usar `@master`, `@main` ou tag curta em Actions enquanto a política de segurança exigir SHA.

## Teste esperado
- reexecutar o workflow `SonarQube Analysis`;
- confirmar que o job passa de `Set up job` e realmente executa checkout/setup/scan;
- somente depois usar o resultado do Sonar como evidência de qualidade da Onda 2.5.

## Contexto adicional
Este bloqueio é de infraestrutura de CI e não foi causado pelos diffs dos Agentes 01, 06 ou 07. `.github/workflows/**` é propriedade exclusiva do Agente 08 conforme `AGENTS.md`, por isso o Coordenador não alterou o workflow diretamente.

## Resolução
Todas as referências `uses:` por tag/branch (`@v4`, `@v3`, `@v5`, `@master` etc.) em
`.github/workflows/**` foram substituídas por SHA completo + comentário com a versão legível,
seguindo o padrão já usado em `onda-2.5-validation.yml` (`actions/checkout@11d5960a...# v4`).

Arquivos corrigidos: `sonarqube.yml` (o bloqueador citado neste handoff —
`actions/checkout@v4`, `actions/setup-node@v4`, `SonarSource/sonarqube-scan-action@master`),
`ci.yml`, `cd-homolog.yml`, `android-build.yml`, `ios-build.yml`, `deploy-pages.yml`. Também
corrigido `production.yaml` (mesmo problema, não estava na lista original mas está no mesmo
escopo exclusivo do Agente 08 e ficaria bloqueado pela mesma política).

Nenhuma versão foi alterada — apenas pinada (regra "sem upgrade nesta tarefa"). SHAs obtidos via
`https://api.github.com/repos/<owner>/<repo>/commits/<tag>` (endpoint que resolve tag/branch pro
commit SHA de 40 caracteres, funciona tanto para tag leve quanto anotada), verificados por `curl`
direto (não pelo resumo de um WebFetch/LLM, para evitar erro de transcrição num SHA de 40
caracteres):

| Action | Tag | SHA completo |
|---|---|---|
| actions/checkout | v4 | `11d5960a326750d5838078e36cf38b85af677262` (reaproveitado de `onda-2.5-validation.yml`, confirmado) |
| actions/setup-node | v4 | `49933ea5288caeca8642d1e84afbd3f7d6820020` (idem) |
| actions/upload-artifact | v4 | `ea165f8d65b6e75b540449e92b4886f43607fa02` (idem) |
| SonarSource/sonarqube-scan-action | master | `ad8210318ac8bb816e41990d5af2b304f7a6c213` (snapshot do master no momento da correção — a action não publica tag de versão estável, então o pin é um snapshot, não uma versão; deve ser revisitado/atualizado periodicamente) |
| gitleaks/gitleaks-action | v2 | `ff98106e4c7b2bc287b24eaf42907196329070c7` |
| docker/login-action | v3 | `c94ce9fb468520275223c153574b00df6fe4bcc9` |
| docker/setup-buildx-action | v3 | `8d2750c68a42422c14e847fe6c8ac0403b4cbd6f` |
| docker/metadata-action | v5 | `c299e40c65443455700f0fdfc63efafe5b349051` |
| docker/build-push-action | v5 | `ca052bb54ab0790a636c9b5f226502c73d547a25` |
| actions/setup-java | v4 | `cf277c60eb25467037889841efdb72551f06f6c3` |
| actions/configure-pages | v4 | `1f0c5cde4bc74cd7e1254d0cb4de8d49e9068c7d` |
| actions/upload-pages-artifact | v3.0.1 | `56afc609e74202658d3ffba0e8f6dda462b719fa` |
| actions/deploy-pages | v4 | `d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e` |

Validação: `grep -rnE "uses:\s+[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+@(v[0-9]|master|main)" .github/workflows/`
não retorna nenhuma referência restante por tag/branch. Todos os 7 arquivos alterados foram
parseados com sucesso por PyYAML (`yaml.safe_load`), confirmando sintaxe YAML válida. Não foi
possível reexecutar o workflow `SonarQube Analysis` de verdade neste ambiente (sem acesso ao
GitHub Actions) — a confirmação definitiva de que o job passa do step `Set up job` só acontece
quando os workflows rodarem no GitHub após o push, conforme já esperado pela missão original.

Commit: `fix(08): pina todas as GitHub Actions por SHA completo` (branch
`worktree-agent-a6d009098fcbf11e8`).
