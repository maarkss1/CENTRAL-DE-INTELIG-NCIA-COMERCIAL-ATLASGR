# Métricas reais de qualidade — lint, typecheck, cobertura

P2 (Arquitetura e Manutenção), item 2: "Atualizar medição real de cobertura, lint e typecheck".
Este documento registra o estado medido de verdade nesta rodada — rodando os comandos reais do
repositório, não recuperando um número de memória ou de um relatório antigo — e deve ser
atualizado (não duplicado) na próxima vez que alguém rodar essa medição de novo.

## Como reproduzir

```bash
npm ci
PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 npx prisma generate   # só necessário se o binário do
                                                                # schema-engine não baixar via proxy
npx tsc --noEmit
npx eslint src
npx vitest run -c vitest.unit.config.ts --coverage --coverage.reportOnFailure
```

## Medição — 2026-08-21

| Verificação | Comando | Resultado |
|---|---|---|
| Typecheck | `tsc --noEmit` | **0 erros** |
| Lint | `eslint src` | **0 erros, 99 warnings** (todos pré-existentes — nenhum introduzido nesta rodada; ver lista completa rodando o comando) |
| Testes unitários | `vitest run -c vitest.unit.config.ts` | 1558-1559/1561 passam. 2 falhas pré-existentes, confirmadas na branch `main` sem nenhuma mudança desta rodada (ver "Falhas conhecidas" abaixo) |
| Cobertura (unit only) | `vitest run -c vitest.unit.config.ts --coverage` | Statements 63.08% (7193/11402) · Branches 54.79% (4181/7630) · Functions 62.66% (1450/2314) · Lines 64.28% (6505/10119) |

### Falhas conhecidas (pré-existentes, não corrigidas nesta rodada — fora do escopo de arquitetura)

- `tests/unit/features/automation-sdr-voz.test.ts` — 2 testes falhando (`liga para o lead
  recém-criado...`, `isola a falha da ligação...`). Confirmado que falha igual na `main` antes
  desta rodada (`git stash` + rerun). Não investigado a fundo aqui — é bug de comportamento da
  automação "Ligar via SDR de Voz", não de arquitetura/DI.
- `tests/unit/features/prospecting/services/prospecting.service.dedupe.test.ts` — timeout
  intermitente (5000ms) num rerun completo da suíte; passou isoladamente e num rerun em `main`.
  Aparenta ser lentidão de ambiente sob carga (toda a suíte rodando junto), não falha
  determinística — mantido como suspeita de flake, não confirmado.

## Limitação real de ambiente — cobertura de integração/e2e não medida

`npm run coverage` (`coverage:unit` + `coverage:integration`) e `npm run test:e2e` (Playwright)
não rodaram nesta sessão: `tests/integration/**` e `tests/e2e/**` exigem Postgres em
`localhost:5434` (`.env.test.example`), e este ambiente remoto não tem esse serviço disponível
(`Connection refused` na porta). A cobertura acima é **só de `vitest.unit.config.ts`** — mocka
Prisma/serviços externos e não exercita rotas Express reais fim a fim, então o número real de
cobertura da aplicação completa (unit + integration + e2e) é maior do que os 63-64% acima, mas
não foi possível medir aqui. Isso é uma limitação de ambiente desta sessão, não uma afirmação de
que a cobertura real da aplicação é essa.

Sugestão para quem rodar isso com acesso a um Postgres local: `npm run infra:up` (sobe Postgres
via `docker-compose.yml` + `docker-compose.opensource.yml`) antes de `npm run coverage`.
