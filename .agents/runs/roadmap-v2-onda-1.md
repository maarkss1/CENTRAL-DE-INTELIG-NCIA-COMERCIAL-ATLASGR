# Roadmap v2 — Onda 1 — Acesso, segurança e confiança do boot

- **SHA base:** `93c7ba4b` (relatório W0 sobre snapshot materializado `3f92c44b`)
- **Data/hora (UTC):** 2026-08-22T17:15:00Z
- **Branch:** `integracao/roadmap-v2-onda-1`
- **Decisão:** **BLOCKED**. A W2 não foi criada: integration/E2E não executam sem Docker/serviços reais, o audit externo falha fechado por registry 403, o unit completo excedeu 700 s no gate integrado e o estado GitHub segue inacessível.

## Especialistas, isolamento e propriedade

A matriz e as missões foram publicadas antes do disparo em `roadmap-v2-onda-0.md`. Executaram em worktrees exclusivos: 01 (package/start e regressão), 14 (harness), 08 (workflow canônico), seguidos por 10 (charts/runtime), 03 (Dialog conforme owner local) e 15 (segurança). 01A não executou. `server.ts`, schema/migrations e lockfile não foram alterados. Donos únicos mantidos: package=01; workflows=08; charts=10; Dialog=03; segurança=15; harness=14.

## Integrações por leva

1. **Leva 1:** 01 (`b89eaf8`) + 08 (`03e1fe1`). Gate: typecheck/lint verdes; unit integrado antigo não terminou e foi encerrado; integration/E2E bloqueados pelo ambiente. O 14 reproduziu que a suíte cresceu para 210 arquivos/1.578 testes e passou isoladamente em 353 s, então ajustou pool/limite de workers (`6804a9a`), integrado separadamente.
2. **Leva 2:** 10 (`a4d602d`) + 03 (`e5252d5`). O gate encontrou `TS2769` no teste do Dialog. Conforme governança, o merge do 03 foi revertido (`60b40a6`) e devolvido com reprodução objetiva. O agente corrigiu em `aec52ad` e o conjunto foi reintegrado.
3. **Leva 3:** 03 corrigido + 15 (`8fd2f99`, `fa025d0`). Durante o gate, `security:audit-waivers` revelou falso PASS preexistente diante de HTTP 403; o 15 recebeu a reprodução, mudou para fail-closed e adicionou regressão.

## Correções e evidências

- `npm start` agora executa somente `node dist/server.cjs`; reset global permanece comando explícito e também exige `--confirm-global-password-reset` antes de qualquer acesso ao banco.
- Reset emergencial não seleciona/loga e-mail individual; registra somente totais agregados.
- CI local expõe contexto canônico `Central AtlasGR / release gate`, separado de ETLs, mobile e deploys. Branch protection real não pôde ser verificada sem remote/GitHub auth.
- Harness acusa Docker ausente como FAIL explícito, sem skip/falso PASS, e limita workers unitários.
- Dialog usa `open:flex open:flex-col`, preservando o `display:none` nativo quando fechado; regressão cobre lifecycle.
- Worker Helm dedicado desabilita workers embutidos, publica health probes e recebe grace period superior ao shutdown interno.
- Audit waiver rejeita payload de erro/incompleto. No host atual, registry responde 403 e o comando corretamente retorna 1.

## Gate final da integração

| Comando | Exit | Duração | Evidência |
|---|---:|---:|---|
| `npx tsc --noEmit` | 0 | 99 s | PASS após correção do teste Dialog. |
| `npx eslint src` | 0 | 56 s | PASS com 97 warnings preexistentes, zero errors. |
| Testes focais W1 (`startup`, `Dialog`, `audit-waivers`) | 0 | 20 s | 3 arquivos, 6 testes PASS. |
| `npm run test:unit` completo | 124 | 700 s | BLOCKED no gate integrado; execução isolada do 14 passou 210 arquivos/1.578 testes em 353 s, mas a condição exige estabilidade integrada. |
| `npm run test:integration` | 1 | 8 s | Docker CLI ausente; nenhum teste executado. |
| `npm run test:e2e` | 1 | 7 s | Docker CLI ausente; nenhum teste executado. |
| `npm run build` | 0 | 78 s | PASS; warnings de chunks/eval existentes. |
| `npm run security:audit-waivers` | 1 | 12 s | PASS de segurança fail-closed, mas gate vermelho: registry retornou 403 e não houve relatório válido. |
| `git diff --check 3f92c44..HEAD` | 0 | <1 s | PASS. |

A varredura fallback apontou senhas estáticas de **ambiente de teste já existentes** em `.github/workflows/ci.yml` e `scripts/test/prepare-integration-env.js`; o diff da onda não introduz segredo real, mas a ferramenta corretamente não autoriza alegar scan verde. `gitleaks` e Docker não estão disponíveis. Isso permanece linha vermelha do gate, não é convertido em sucesso.

## Handoffs e bloqueadores

- Não foi criado handoff interno novo: regressões de 03 e 15 foram devolvidas e corrigidas na própria onda.
- Bloqueios externos: (a) checkout sem remote/ref main/gh auth; (b) Docker/serviços reais ausentes; (c) registry npm audit responde 403; (d) gitleaks/Helm/Kubernetes indisponíveis; (e) smoke de restart/persistência/tenant não executável neste host.
- Handoffs históricos em andamento permanecem os inventariados na W0; nenhum foi falsamente marcado resolvido.

## Condição para retomar e aprovar W1

Em ambiente com remote GitHub autenticado, Docker/serviços reais, registry audit acessível e gitleaks: reconciliar SHA/PRs/issues/checks; executar duas vezes o gate completo até exit 0; comprovar restart sem reset/worker duplicado, auth/RBAC/tenant e scan sem segredo positivo. Só então remover `BLOCKED`, criar `integracao/roadmap-v2-onda-2` e avançar. Não existe autorização para pular à W2 com os testes atuais não executados.
