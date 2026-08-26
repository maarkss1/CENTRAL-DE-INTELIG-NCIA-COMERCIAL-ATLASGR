# Inventário de dependências — RC/beta e deprecated

Gerado automaticamente por `npm run security:dependency-inventory` (`scripts/security/dependency-inventory.ts`). **Não edite manualmente** — rode o script de novo para atualizar. Última geração: 2026-08-25.

Este arquivo cobre visibilidade (o que existe e por quê). Para vulnerabilidade conhecida (CVE/GHSA) e o waiver formal correspondente, a fonte de verdade continua sendo `docs/security/AUDIT_WAIVERS.md` — não duplique um waiver de vulnerabilidade aqui.

Total de pacotes resolvidos em `package-lock.json`: **1429**.

## Dependências em versão pré-release (RC/beta/alpha/next/canary)

| Pacote | Versão resolvida | Direta/Transitiva | Tag |
|---|---|---|---|
| `@rolldown/pluginutils` | `1.0.0-rc.3` | Transitiva | rc.3 |
| `@visx/curve` | `4.0.1-alpha.0` | Transitiva | alpha.0 |
| `@visx/event` | `4.0.1-alpha.0` | Transitiva | alpha.0 |
| `@visx/grid` | `4.0.1-alpha.0` | Transitiva | alpha.0 |
| `@visx/group` | `4.0.1-alpha.0` | Transitiva | alpha.0 |
| `@visx/point` | `4.0.1-alpha.0` | Transitiva | alpha.0 |
| `@visx/responsive` | `4.0.1-alpha.0` | Transitiva | alpha.0 |
| `@visx/scale` | `4.0.1-alpha.0` | Transitiva | alpha.0 |
| `@visx/shape` | `4.0.1-alpha.0` | Transitiva | alpha.0 |
| `@visx/vendor` | `4.0.0-alpha.0` | Transitiva | alpha.0 |
| `@whiskeysockets/baileys` | `7.0.0-rc13` | Direta | rc13 |
| `gensync` | `1.0.0-beta.2` | Transitiva | beta.2 |
| `resolve` | `2.0.0-next.7` | Transitiva | next.7 |
| `web-streams-polyfill` | `4.0.0-beta.3` | Transitiva | beta.3 |

## Pacotes deprecated encontrados no último `npm ci`/`npm install` analisado

| Pacote | Versão | Aviso do npm |
|---|---|---|
| `fstream` | `1.0.12` | This package is no longer supported. |
| `glob` | `7.2.3` | Old versions of glob are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version. Please update. Support for old versions may be purchased (at exorbitant rates) by contacting i@izs.me |
| `glob` | `10.5.0` | Old versions of glob are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version. Please update. Support for old versions may be purchased (at exorbitant rates) by contacting i@izs.me |
| `inflight` | `1.0.6` | This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful. |
| `lodash.isequal` | `4.5.0` | This package is deprecated. Use require('node:util').isDeepStrictEqual instead. |
| `prebuild-install` | `7.1.3` | No longer maintained. Please contact the author of the relevant native addon; alternatives are available. |
| `rimraf` | `2.7.1` | Rimraf versions prior to v4 are no longer supported |

Ver `docs/security/DEPENDENCY_POLICY.md` para a política de atualização/estabilização e a justificativa de cada dependência RC/beta **direta** aceita.
