# Sistema de Agentes — CENTRAL-DE-INTELIGENCIA-COMECIAL-ATLASGR

## Arquivos
- `prompts/00-coordenador.md`
- `prompts/01-plataforma-dados.md`
- `prompts/02-produto-ux.md`
- `prompts/03-design-a11y.md`
- `prompts/04-crm-bi.md`
- `prompts/05-prospeccao.md`
- `prompts/06-integracoes-bitrix.md`
- `prompts/06A-extracoes-bitrix.md` — especialista interno do Agente 06
- `prompts/07-ia-automacoes.md`
- `prompts/08-qa-release.md`
- `prompts/09-mobile.md`
- `prompts/10-infraestrutura-sre.md`
- `prompts/11-marca-institucional.md`
- `prompts/12-voz-telefonia.md`
- `prompts/13-enxame-governanca-agentes.md`
- `prompts/14-ambiente-execucao-harness.md`
- `prompts/15-seguranca-aplicada.md`
- `prompts/16-runtime-workers-escala.md`
- `prompts/17-cadencia-ciclo-receita.md`
- `prompts/18-contratos-api-docs.md`
- `prompts/01A-dados-rls-retencao.md` — especialista interno do Agente 01, mesmo slot
- `COMO-CHAMAR-OS-AGENTES.md` — prompts prontos para colar, um por agente, para abrir a sessão correspondente em qualquer ferramenta de agente de código

## Pastas de execução (criadas em runtime, não versionadas com conteúdo sensível)
- `runs/` — relatórios de onda do Coordenador (`baseline.md`, `onda-2.md`, `onda-2.5.md`, `onda-4.md`, `onda-5.md`, …). Somente o Coordenador escreve aqui. Inclui a matriz de propriedade que `/AGENTS.md` → "Regra de concorrência" exige antes de disparar uma onda com mais de 3 especialistas.
- `completion/` — mapa da plataforma, inventário, bloqueadores e o plano das Ondas 6–8 de finalização.
- `handoffs/onda-<n>/` — um arquivo por handoff, formato definido em `/AGENTS.md` → "Protocolo de handoff". Qualquer agente cria o próprio arquivo.

## Como executar
1. Inicie o agente 00.
2. Dê ao coordenador acesso ao repositório completo.
3. Ele deve ler `/AGENTS.md`.
4. Ele cria a branch de integração da onda e um `git worktree` por especialista ativo (ver `/AGENTS.md` → "Isolamento de execução").
5. Execute os especialistas conforme `/AGENTS.md` → "Regra de concorrência" (até 8 simultâneos, com propriedade disjunta verificada antes de disparar e gate a cada 2–3 merges), cada um no próprio worktree.
6. Siga `EXECUCAO-ONDAS.md`, incluindo a Onda 4 (09 Mobile, 10 Infraestrutura/SRE, 11 Marca) quando aplicável.
7. Não pule gates de typecheck/lint/tests/build.
8. Não aceite "auditoria concluída" quando existe correção executável.
9. Revise handoffs abertos em `.agents/handoffs/onda-<n>/` antes de aprovar a onda.

## Observação
Os `AGENTS.md` locais definem propriedade e evitam que especialistas editem as mesmas áreas de forma concorrente. Nenhum agente edita os arquivos em `prompts/` — ajuste de prompt é decisão humana fora do ciclo de execução.
