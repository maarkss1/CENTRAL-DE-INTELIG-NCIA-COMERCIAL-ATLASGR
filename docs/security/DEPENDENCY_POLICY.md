# Política de dependências e SBOM

Criado no ITEM-11 (SBOM e governança de dependências, Onda 3), construído sobre a infraestrutura
de gates de segurança do ITEM-10 (CodeQL/Trivy/Dependency Review, Onda 2). Este arquivo é a fonte
de verdade para **como** o projeto atualiza dependências e **por que** cada dependência
pré-release (RC/beta/alpha) direta é aceita. Ele complementa, sem duplicar:

- `docs/security/AUDIT_WAIVERS.md` — fonte de verdade única para waiver de **vulnerabilidade
  conhecida** (CVE/GHSA) em `npm audit`, Trivy e Dependency Review. Se o problema é "essa
  dependência tem um CVE aberto que estamos aceitando temporariamente", o registro vai lá, não
  aqui.
- `docs/security/DEPENDENCY_INVENTORY.md` — snapshot gerado por
  `npm run security:dependency-inventory` (`scripts/security/dependency-inventory.ts`) com a lista
  completa de pacotes em versão pré-release e pacotes deprecated encontrados no lockfile/última
  instalação analisada. Este arquivo (`DEPENDENCY_POLICY.md`) explica a política e justifica os
  casos diretos relevantes; o inventário é o dado bruto, reproduzível a qualquer momento.

## SBOM (Software Bill of Materials)

- **Formato:** CycloneDX 1.6 JSON, gerado por `@cyclonedx/cyclonedx-npm` (devDependency) a partir
  de `package-lock.json` — não requer rede além do que `npm ci` já usa, e reflete exatamente as
  versões resolvidas e instaladas (não os ranges de `package.json`).
- **Comando:** `npm run security:sbom` (`cyclonedx-npm --output-format JSON
  --output-reproducible --output-file sbom.cdx.json`). `--output-reproducible` evita ruído de
  timestamp/UUID entre execuções idênticas, para diffs de SBOM significativos entre releases.
- **Quando é gerado:** em todo release real — job `publish` de
  `.github/workflows/production.yaml` (produção, `workflow_dispatch`) e job `build-and-push` de
  `.github/workflows/cd-homolog.yml` (homologação, `workflow_dispatch`) — depois do checkout do
  commit que vai ser publicado, antes/junto da build da imagem Docker que leva a mesma tag.
- **Correlação com commit/release:** o SBOM é publicado como artefato do workflow run
  (`actions/upload-artifact`) com nome `sbom-<sha curto>` e retenção de 90 dias — o mesmo `sha`
  usado na tag da imagem Docker publicada nesse run (`type=sha,format=short` em
  `production.yaml`, `github.sha` em `cd-homolog.yml`). Para reconstruir o SBOM de qualquer release
  publicado: `git checkout <sha>`, `npm ci`, `npm run security:sbom` — determinístico dado o mesmo
  `package-lock.json`.
- **Por que não versionar `sbom.cdx.json` no git:** o arquivo muda a cada mudança de qualquer
  dependência transitiva (não só direta) — versioná-lo no repositório geraria diff ruidoso
  desconectado da mudança de código real em quase todo PR. Artefato de workflow run (imutável,
  retido, associado ao SHA que gerou) é o formato correto para algo que descreve "o que foi
  publicado nesta build", não "o estado atual do branch".

## Versões pré-release (RC/beta/alpha) em dependência direta

Regra: uma dependência **direta** de produção em versão pré-release só é aceita com uma entrada
nesta seção — motivo, risco avaliado e critério de saída para a versão estável. Dependência
**transitiva** pré-release (puxada por outra dependência que controlamos) é só rastreada em
`docs/security/DEPENDENCY_INVENTORY.md`, não exige entrada aqui, porque não temos controle direto
sobre a versão sem trocar a dependência que a puxa — mas se ficar identificada como fonte real de
instabilidade, também deve virar uma entrada de "débito conhecido" no inventário.

### `@whiskeysockets/baileys@^7.0.0-rc13` — cliente WhatsApp Web

- **Uso:** `src/features/integrations/whatsapp/whatsapp.service.ts` — sessão WhatsApp por tenant
  (QR code, envio/recebimento de mensagem). Já classificado como "real, mas frágil" em
  `docs/architecture/FEATURE-CLASSIFICATION.md` (sessão global não multi-tenant, sem backoff de
  reconexão, handler de mensagem recebida vazio — SEC-005/BACK-006), débito **de implementação**
  independente do fato de a lib estar em RC.
- **Por que RC e não uma versão estável:** a família 7.x do Baileys é a única compatível com o
  protocolo atual do WhatsApp Web multi-device — a última 6.x estável ficou obsoleta pelo lado do
  WhatsApp, não por escolha do projeto. Fixar numa RC específica (`rc13`, não um range aberto tipo
  `^7.0.0-rc.0`) evita que uma RC futura quebre a integração silenciosamente numa atualização
  automática do Dependabot; atualizações de RC para RC passam por PR revisado normalmente, iguais
  a qualquer outra dependência.
- **Risco avaliado:** API pode mudar entre RCs sem SemVer estrito (é pré-release, por definição).
  Mitigado por: (1) a integração já é tratada como frágil por padrão no código e na documentação,
  não como caminho crítico de negócio; (2) cobertura de teste da integração roda antes de qualquer
  merge (`ci.yml`); (3) `npm run security:audit-waivers`/CodeQL/Trivy cobrem vulnerabilidade
  conhecida do pacote como qualquer outra dependência — RC não é isenção de scan de segurança.
- **Critério de saída:** migrar para a primeira tag estável (`7.x.x` sem sufixo de pré-release)
  assim que o autor upstream publicar uma. Reavaliar a cada Dependabot PR que tocar
  `@whiskeysockets/baileys` — não esperar uma data fixa, porque o cronograma de estabilização é
  decidido pelo mantenedor upstream, não por nós.
- **Dono:** time de integrações (WhatsApp) — mesma responsabilidade de BACK-006.

## Pacotes não utilizados — critério de remoção

Um pacote entra como candidato a remoção quando:

1. **Zero import estático** em `src/`, `server.ts`, `worker.ts`, `scripts/`, `tests/` — verificado
   por busca textual (`from '<pkg>'`/`require('<pkg>')`/subpaths) confirmando ausência em todo o
   repositório, não só numa pasta.
2. **Zero referência de config** — não é lido por nome de string em nenhum arquivo de config
   (ex.: `pino-loki`/`pino-pretty` são referenciados como `target:` string no transport do `pino`
   em `src/lib/logger.ts`, não via `import` — por isso **não** contam como não utilizados apesar de
   um scanner ingênuo de import poder marcá-los assim).
3. **Zero uso via ferramenta nativa/config declarativo** — ex.: `@capacitor/android`,
   `@capacitor/core`, `@capacitor/ios` são consumidos por `capacitor.config.ts` e pela geração de
   projeto nativo (`android/`, `ios/`), não por `import` em código de aplicação — permanecem.

Removidos nesta rodada (ITEM-11), todos com as três condições acima confirmadas — detalhe completo
no changelog do PR e no histórico deste arquivo:

| Pacote | Motivo |
|---|---|
| `@langchain/community` | Zero import em todo o repositório **e** deprecated pelo mantenedor upstream (aviso `npm warn deprecated` no install). |
| `langchain` (pacote raiz) | Zero import — o projeto usa só os pacotes `@langchain/*` (core, openai, langgraph, langgraph-checkpoint-postgres), que continuam em uso real. |
| `@hello-pangea/dnd` | Zero import — o Kanban do CRM usa `@dnd-kit/*` (confirmado em `KanbanColumn.tsx`/`KanbanCard.tsx`); as duas libs de DnD nunca estiveram as duas em uso simultâneo. |
| `@react-oauth/google` | Zero import — login Google usa `google-auth-library` (server-side), que permanece. |
| `@tanstack/react-query` | Zero import, e já documentado como tal em código: comentário em `src/hooks/useFeatureFlags.ts` explicando que o hook evita react-query de propósito por não haver `QueryClientProvider` montado em nenhum lugar do app. |
| `@tanstack/react-table` | Zero import em todo o repositório. |
| `axios` | Zero import — todo HTTP client do projeto usa `fetch` nativo ou SDKs próprios (ex.: `google-auth-library`, `@aws-sdk/*`). |
| `cheerio` | Zero import — nenhum scraping/parse de HTML usa esta lib hoje. |
| `chromadb` | Zero import — `scripts/setup-vector-db.ts` usa Postgres/`pgvector` diretamente (`pg`), não ChromaDB; resquício de uma decisão de arquitetura anterior à migração para pgvector. |
| `duck-duck-scrape` | Zero import em todo o repositório. |
| `eslint-config-prettier` (devDependency) | Nunca referenciado em `eslint.config.mjs` (sem `extends`/spread do config) — `prettier` continua em uso real (formatação via CLI/editor), só a ponte com eslint nunca foi ligada. |

Não removidos apesar de aparecerem como "possivelmente não usados" numa varredura automática
(`depcheck`) — falsos positivos confirmados manualmente, ver critério 2/3 acima:
`@capacitor/android`, `@capacitor/core`, `@capacitor/ios`, `pino-loki`, `pino-pretty`,
`tailwindcss`, `autoprefixer`, `dotenv-cli`, `@typescript-eslint/eslint-plugin`,
`@typescript-eslint/parser` (usados via `typescript-eslint`/config declarativo), `@types/jest`,
`@types/three` (pacotes de tipos — risco de segurança é zero; mantidos sem investigação adicional
nesta rodada por não servirem ao objetivo de redução de superfície de risco do item).

`@langchain/community` também tinha uma entrada dedicada em `overrides` de `package.json`
(`"@langchain/community": { "ioredis": "$ioredis" }`) — removida junto, por ficar sem efeito depois
que o pacote que ela ajustava deixou de existir na árvore.

## Cadência de atualização

- **Dependabot** (`.github/dependabot.yml`) já roda semanalmente contra o ecossistema `npm`. Este
  item não altera a cadência — só documenta a política que rege como um PR do Dependabot é
  avaliado:
  1. **Patch/minor de dependência já estável:** merge normal depois que os gates de CI passarem
     (lint, typecheck, testes, `npm run security:audit-waivers`, CodeQL, Trivy, Dependency Review —
     ver `docs/security/AUDIT_WAIVERS.md` para o inventário completo de gates do ITEM-10). Não
     precisa de revisão humana adicional além da normal de PR.
  2. **Major de dependência estável:** exige revisão humana explícita do changelog upstream antes
     do merge — mudança breaking em potencial, mesmo passando nos gates automáticos (os gates
     testam comportamento coberto por teste, não API pública inteira).
  3. **Qualquer versão de dependência pré-release (RC/beta/alpha)**, direta: precisa de uma entrada
     nova ou atualizada na seção "Versões pré-release" deste arquivo antes do merge — não é
     bloqueado automaticamente por ferramenta, é revisão humana obrigatória, igual ao waiver de
     vulnerabilidade em `AUDIT_WAIVERS.md`.
- **SBOM e inventário** não são recalculados automaticamente a cada PR — só a cada release real
  (`production.yaml`/`cd-homolog.yml`), como descrito acima. Rodar
  `npm run security:dependency-inventory` manualmente (ou como parte de handoff de sprint) sempre
  que quiser um snapshot atualizado sem esperar um release.
- **Pacotes deprecated encontrados fora de uma dependência direta nossa** (transitivos de
  devDependencies de ferramenta — ex.: `glob@7`/`inflight`/`rimraf@2` puxados por
  `testcontainers`/`playwright`/toolchain de build, `lodash.isequal` puxado por dependência de
  teste): não bloqueiam release — não fazem parte do artefato de produção (`dist/`), só do
  ambiente de desenvolvimento/CI. Ficam rastreados em
  `docs/security/DEPENDENCY_INVENTORY.md`; resolvidos quando a ferramenta que os puxa publicar uma
  versão que já não dependa deles, não por substituição manual da transitiva (isso é
  responsabilidade do mantenedor da ferramenta, não nossa).

## Histórico

- 2026-08-25 — ITEM-11 (Onda 3): criado este arquivo, `docs/security/DEPENDENCY_INVENTORY.md` e
  `scripts/security/dependency-inventory.ts`. Adicionado `npm run security:sbom`
  (`@cyclonedx/cyclonedx-npm`) aos releases reais (`production.yaml`, `cd-homolog.yml`). Removidas
  11 dependências de produção sem uso real e 1 devDependency sem uso real (tabela acima) —
  validado com `tsc --noEmit`, `npm run lint`, `npm run test:unit` e `npm run build` limpos após a
  remoção, sem regressão atribuível à mudança. Documentada a justificativa de
  `@whiskeysockets/baileys@rc` como a única dependência direta de produção em versão pré-release.
