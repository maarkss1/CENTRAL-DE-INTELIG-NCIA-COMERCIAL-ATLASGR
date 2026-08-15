- De: Agente 15 (Segurança Aplicada e Rotação de Segredos)
- Para: Agente 00 (Coordenador — aprovação de `package.json`/lockfile)
- Onda: 6
- Status: aberto
- Prioridade: normal

## Problema
`npm audit --audit-level=moderate` confirma as 4 vulnerabilidades `moderate` já registradas em
`.agents/completion/01-bloqueadores.md`, todas com a mesma causa raiz: `uuid <11.1.1`
(`GHSA-w5hq-g745-h8pq`, CWE-787/1285, "missing buffer bounds check in v3/v5/v6 when buf is
provided", CVSS 7.5), puxado transitivamente por duas cadeias independentes:

| Pacote afetado | Cadeia | Uso no projeto | Exposição real |
|---|---|---|---|
| `uuid` (via `exceljs`) | dependência **direta de produção** (`exceljs` está em `dependencies`) | geração de planilhas XLSX exportadas para o usuário final (`scripts/setup-vector-db.ts` e módulos de export do CRM) | **Produção, mas baixo risco prático**: a vulnerabilidade exige que o código chame `uuid.v3/v5/v6` passando um buffer de saída fornecido pelo chamador (`buf` param) — não é o padrão de uso do `exceljs` internamente (que não expõe geração de UUID controlável por input externo do usuário). Sem vetor de exploração identificado neste código, mas é dependência de produção real, não dev-only. |
| `uuid` (via `dockerode` → `testcontainers`) | dependência **direta de devDependencies** (`testcontainers`, usado em `test:integration`) | só roda em ambiente de teste local/CI, nunca em produção | **Dev-only, sem exposição em produção.** `dockerode`/`testcontainers` nunca sobem no runtime do Render. |

`npm audit fix --force` resolveria via upgrade major de `exceljs` (3.4.0, downgrade na verdade —
`fixAvailable` aponta para uma versão **anterior**, o que é um sinal de que a árvore de
dependências do `exceljs` atual não tem uma versão corrigida na mesma major; precisa investigação
antes de aplicar às cegas) e de `testcontainers` (12.1.0, major bump).

## Arquivo(s) envolvido(s)
- `package.json` / `package-lock.json` — propriedade exclusiva do Agente 00 nesta onda, por isso
  não apliquei a correção.

## Alteração necessária
Decisão de negócio/compatibilidade, não uma correção óbvia:
1. **`testcontainers`** (dev-only): upgrade para `^12` é provavelmente seguro de aplicar
   isoladamente (não afeta runtime de produção) — mas é major bump, pode exigir ajuste de API nos
   testes de integração (`tests/integration/**`, fora do meu escopo). Risco de regressão limitado a
   `test:integration`.
2. **`exceljs`**: `npm audit` sugere downgrade para `3.4.0` como "fix", o que é suspeito — verificar
   se existe uma versão do `exceljs` mais recente que a atual e que já não dependa de `uuid<11.1.1`,
   em vez de aceitar automaticamente o downgrade sugerido pelo `npm audit fix --force`. Se não
   houver, a alternativa é `npm overrides` fixando `uuid` para `>=11.1.1` sem trocar a versão do
   `exceljs` em si — testar que a geração de XLSX (`exceljs`) continua funcionando com o `uuid`
   forçado para a versão nova antes de aplicar.

Não apliquei nenhuma das duas — ambas tocam `package.json`/lockfile.

## Teste esperado
Depois de qualquer mudança: `npm audit --audit-level=moderate` deve retornar 0 vulnerabilidades
(ou justificar as remanescentes), `npx tsc --noEmit`, `npm run test:unit`,
`npm run test:integration` (para `testcontainers`) e o fluxo de export XLSX do CRM (para
`exceljs`) devem permanecer verdes.

## Contexto adicional
Nenhuma das 4 é `high`/`critical` — não bloqueiam o gate `npm audit --audit-level=high` usado no
próprio gate do Agente 15 (`.agents/prompts/15-seguranca-aplicada.md` → "Gate"). Registrando por
completude/rastreabilidade, não como bloqueador de release.
