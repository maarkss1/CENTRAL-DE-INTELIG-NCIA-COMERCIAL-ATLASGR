# Triagem dos 45 segredos históricos do gitleaks (R9, 2026-09-05)

- **Origem:** `docs/release/FINALIZATION_REPORT_2026-09-04.md` (seção 11, R9) registrou que o
  `secret scan` em modo `workflow_dispatch` (varre todo o histórico, 1846 commits) achou 45
  segredos reais em commits de julho/agosto de 2026, autor `MaarksN`, sem investigar o conteúdo a
  fundo — achado incidental, fora do escopo daquela sessão. Este documento fecha essa
  investigação: SARIF real baixado do artefato do run `33879653897`
  (`gitleaks-results.sarif`), os 45 resultados agrupados por arquivo/commit único e o conteúdo de
  cada um lido diretamente do git (após `git fetch --unshallow`, necessário porque o clone padrão
  desta sessão era raso e não continha esses commits de julho).
- **Achado inicial confirmado**: os 45 resultados do SARIF colapsam em **6 pares
  arquivo+commit únicos** — o resto são repetições do mesmo conteúdo em cópias/momentos diferentes
  do mesmo arquivo ao longo do histórico (reorganizações de diretório).

## Resultado da triagem

| # | Arquivo(s) | Commit(s) | Classificação | Ação |
|---|---|---|---|---|
| 1 | `phase-12-manifest.json` (raiz), `_archive/fases-e-relatorios/phase-12-manifest.json`, `docs/archive/fases/phase-12-manifest.json` — mesmo conteúdo, 3 momentos do histórico (42 dos 45 achados: 14 linhas × 3 cópias) | `1efadfa8`, `ff8ccc29`, `63e3b8aa` | **Falso positivo confirmado.** Conteúdo é um bloco `"hashes": {...}` mapeando caminho de arquivo (Windows, `C:\Users\USER\Documents\GitHub\PROSPECTOR-ATLAS\...`) → hash SHA hex do conteúdo — um manifesto de checksum de refatoração gerado por ferramenta, não credencial. A regra `generic-api-key` do gitleaks casa com qualquer string hex longa por entropia (mesmo mecanismo do falso-positivo #3 já documentado em `.gitleaks.toml` para os `__next._tree.txt`). | Allowlist por path adicionado em `.gitleaks.toml` (`(^|/)phase-12-manifest\.json$`) — não precisa de `.gitleaksignore` por fingerprint porque o padrão se repete em qualquer cópia futura do mesmo tipo de arquivo. |
| 2 | `src/features/crm/components/LeadDetailDrawer.tsx:99` | `9236028b` | **Achado real, já remediado no código atual.** O valor era um shared secret hardcoded (`'segredo_compartilhado_atlasgr_123'`) usado como header de webhook. **Confirmado por leitura do código atual**: esse arquivo não contém mais esse header; a lógica de validação migrou para `src/features/integrations/birth-voice/voiceResult.webhook.ts`, que hoje é fail-closed — sem `ATLASGR_WEBHOOK_SECRET` configurado como variável de ambiente, responde 503 e nunca aceita o valor antigo como fallback (`secretMatches` sempre compara contra `env.ATLASGR_WEBHOOK_SECRET`, nunca contra um literal). Já documentado como corrigido no achado #6/P0-14 de `.agents/completion/01-bloqueadores.md`. | **Ação humana recomendada, não bloqueadora:** confirmar que o valor real configurado como `ATLASGR_WEBHOOK_SECRET` em produção (Render) **não é** `segredo_compartilhado_atlasgr_123` — se alguém copiou o valor antigo do código para a env por conveniência, o vazamento histórico continua explorável apesar do código estar correto. Não foi possível verificar isso nesta sessão (sem acesso ao dashboard do Render). |
| 3 | `test-gemini.ts:2`, `test-gemini-quota.ts:2` | `40242d7e`, `db20c1f3` | **Achado real, JÁ REMEDIADO.** Chave de API real do Google Gemini (`AQ.Ab8RN6Kc...`, formato Google AI Studio) hardcoded em 2 scripts de teste ad-hoc. Os arquivos não existem mais na árvore de trabalho, mas a chave era recuperável no histórico. Confirmado que `@google/genai` não é dependência do `package.json` atual e nenhum caminho de produção instancia `GoogleGenAI` diretamente — não havia indício de uso corrente pelo produto. | **Rotacionada — confirmado diretamente pelo dono do repositório em 2026-09-05.** Runbook `docs/security/runbooks/ROTATE_GEMINI_API_KEY.md` atualizado para "Concluído"; fingerprints suprimidos em `.gitleaksignore`. |

## O que isso muda em relação ao relatório de 04/09

- R9 (`FINALIZATION_REPORT_2026-09-04.md`) dizia "45 segredos... avaliação/rotação é decisão do
  dono do produto", sem detalhar quais eram nem quantos exigiam ação real. Esta triagem reduziu isso
  a 1 ação humana real (a chave Gemini) — **já executada e confirmada pelo dono do repositório em
  2026-09-05** — e **1 confirmação ainda recomendada** (valor
  de `ATLASGR_WEBHOOK_SECRET` em produção) — os outros 42 já não exigem nenhuma ação (falso
  positivo, suprimido por allowlist).
- Nenhuma credencial usada pelo produto em produção hoje foi encontrada exposta nesta triagem.

## Como reproduzir esta investigação

```bash
# 1. Clone raso padrão não contém commits de meses atrás — buscar o histórico completo primeiro:
git fetch --unshallow origin

# 2. Baixar o SARIF do run de workflow_dispatch mais recente do secret scan
#    (mcp__github__actions_list method=list_workflow_run_artifacts,
#     mcp__github__actions_get method=download_workflow_run_artifact)

# 3. Para cada resultado, extrair path/commit/linha do SARIF e inspecionar com:
git show <commit>:<path> | sed -n '<linha-N>,<linha+N>p'
```
