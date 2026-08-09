# Instalação do Pacote de Agentes

## Destino
Extraia/copiei o conteúdo deste pacote diretamente na raiz do repositório:

`CENTRAL-DE-INTELIGENCIA-COMECIAL-ATLASGR/`

O resultado deve conter:

```text
AGENTS.md
.agents/
  README.md
  prompts/
    00-coordenador.md
    01-plataforma-dados.md
    02-produto-ux.md
    03-design-a11y.md
    04-crm-bi.md
    05-prospeccao.md
    06-integracoes-bitrix.md
    06A-extracoes-bitrix.md
    07-ia-automacoes.md
    08-qa-release.md
    09-mobile.md
    10-infraestrutura-sre.md
    11-marca-institucional.md
  runs/          (criada em runtime pelo Coordenador; pode iniciar vazia)
  handoffs/      (criada em runtime pelos agentes; pode iniciar vazia)
src/
  ...
prisma/
  AGENTS.md
android/
  AGENTS.md
identidade-visual/
  AGENTS.md
documentacao-aplicacao/
  AGENTS.md
backups/
  AGENTS.md      (aviso — esta pasta não deveria ter conteúdo versionado)
...
```

## Estratégia de branches/worktrees
O pacote assume que o Coordenador poderá criar branches (`integracao/onda-<n>`, `agente/<numero>-<slug>`) e, se o ambiente de execução suportar, `git worktree` por especialista ativo — ver `/AGENTS.md` → "Isolamento de execução". Confirme que o repositório de destino está limpo (`git status`) e que a ferramenta que orquestra os agentes consegue rodar múltiplos processos apontando para diretórios de trabalho distintos antes de iniciar uma onda com concorrência real. Se isso não for possível, execute os especialistas da onda em série, nunca dividindo um único checkout ao vivo.

## Atenção a pastas que podem não existir
O pacote inclui `infrastructure/AGENTS.md` como governança futura.

Como o repositório atual também usa `k8s/`, `argocd/`, `charts/`, `docker/`, `android/`, `identidade-visual/` e `documentacao-aplicacao/`, foram incluídos `AGENTS.md` nesses locais para que os agentes corretos (10 para infraestrutura/observabilidade, 09 para mobile, 11 para marca/conteúdo institucional) realmente governem o que já existe no repositório de destino.

## Achado de segurança conhecido neste repositório
`backups/prospector-*.dump` está versionado no git. Isso viola a regra de "nunca commitar dump/backup de banco" definida em `/AGENTS.md`. Foi adicionado `backups/AGENTS.md` como aviso permanente e o item entrou como bloqueador prioritário #14 em `/AGENTS.md`. A remediação completa (avaliação de credencial exposta e decisão sobre reescrever histórico do git) é decisão humana — não execute automaticamente.

## Cópia limpa
Antes de compartilhar/copiar o repositório inteiro, use:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\gerar-versao-limpa.ps1 `
  -Origem "C:\CAMINHO\CENTRAL-DE-INTELIGENCIA-COMECIAL-ATLASGR" `
  -Destino "C:\CAMINHO\CENTRAL-DE-INTELIGENCIA-COMECIAL-ATLASGR-LIMPO"
```

O script:
- preserva `.env.example` e `.env.test.example`;
- exclui `.env` e variantes reais;
- exclui `.git`, `node_modules`, `dist`, backups e ambientes virtuais;
- não exclui `prisma/migrations/*.sql`.
