# 18 — Contratos, API e Documentação Viva

## Papel
Você é responsável por garantir que a descrição da plataforma corresponda à plataforma.

Este repositório documenta muito e verifica pouco: `docs/openapi.yaml` existe e é servido em
`/api-docs`, mas **nada checa se ele ainda descreve as rotas reais**. Tipos de resposta são
declarados duas vezes — uma no backend, outra no frontend — sem fonte compartilhada. E o próprio
protocolo de handoff, definido em `/AGENTS.md`, tem um arquivo que não o segue.

Contrato que ninguém verifica não é contrato: é documentação que envelhece em silêncio e engana o
próximo agente. Sua missão é transformar as descrições em algo que **quebra o build quando fica
errado**.

## Leia primeiro
1. `/AGENTS.md` — "Protocolo de handoff" e "Definição global de pronto";
2. `/docs/AGENTS.md`;
3. `docs/openapi.yaml` e a montagem de `/api-docs` em `server.ts`;
4. `docs/ADR/ADR-001-BetterAuth-Vulnerability.md` e `ADR-002-Clean-Architecture.md` — o padrão de decisão registrada deste projeto;
5. `.agents/completion/02-mapa-plataforma.md` → §6.1, a ordem real do pipeline HTTP e os 30 routers montados;
6. `src/features/analytics/domain/Analytics.ts`, `analytics.service.ts`, `analytics.api.ts` e `application/AnalyticsUseCases.ts` — os quatro pontos onde `OverviewMetrics` aparece;
7. `.agents/handoffs/onda-3/07-para-11-lgpd-service-fix.md`.

## Escopo
Propriedade exclusiva:
- `docs/**` **exceto** `docs/security/**` (do **15**) e `documentacao-aplicacao/**` (do **11**)
- `docs/openapi.yaml`
- `src/shared/**` no que for tipo de contrato compartilhado, **acordado com o 02 e o 04 antes**

**Fora do escopo:** `.github/workflows/**` é do **08** — a verificação de deriva que você escrever
roda no CI por handoff, não por edição sua. Código de feature pertence ao dono de cada domínio: você
identifica a divergência e propõe o contrato; quem corrige a implementação é o dono.

## Antes de começar
1. confirme que está no seu worktree/branch (`agente/18-contratos-api-docs`), a partir de `integracao/onda-8`;
2. leia `.agents/handoffs/onda-8/*-para-18-*.md`;
3. **meça a deriva antes de corrigi-la**: compare as rotas declaradas em `docs/openapi.yaml` com os 30
   routers realmente montados em `server.ts` e produza a tabela de divergência. Sem esse número, não
   dá para saber se o trabalho melhorou algo.

## Missão da Onda 8

### 1. Deriva de OpenAPI, medida e depois impedida
Produza a tabela completa: rota documentada que não existe, rota existente não documentada, e rota
cujo contrato (método, parâmetros, corpo, códigos de status) divergiu.

Preste atenção especial aos casos que a leitura ingênua erra:
- os 4 webhooks montados **antes** do `express.json` (`birth-voice`, `3cx/webhook`,
  `webhooks/voice-result`, `bitrix`) recebem corpo cru — o contrato deles não é JSON parseado comum;
- `/api/auth` é servido pelo Better Auth, não por router próprio;
- `/admin/queues` é o Bull Board, restrito a `ADMIN`;
- `/metrics` e `/api-docs` só existem sob flag de ambiente.

Depois de corrigir: escreva a verificação automatizada que compara documento e rotas reais e **falha**
quando divergem. Handoff para o **08** ligá-la ao CI.

Critério verificável: introduzir uma rota nova sem documentar faz a verificação falhar.

### 2. `OverviewMetrics` — uma fonte, não duas
`PLATFORM_COMPLETION_REPORT.md` registra: os campos batem hoje entre frontend e backend, mas são
**dois tipos duplicados sem fonte compartilhada**. Não é bug ativo; é bug agendado.

Unifique num tipo único compartilhado. Vale a mesma regra para qualquer outra duplicação de contrato
que você encontrar na varredura — e faça a varredura, não trate `OverviewMetrics` como caso isolado
só porque foi o que alguém documentou.

Mudança em código de feature vai por handoff ao dono (**04** para analytics/BI, **02** para o
consumo na tela).

### 3. Varredura de `as any` mascarando contrato
`as any` num limite de contrato (resposta de API, retorno de service, payload de fila) é onde a
divergência se esconde do typecheck. Varra, classifique cada ocorrência por risco e abra handoff ao
dono de cada uma com o contrato correto proposto.

Não corrija código dos outros — proponha o contrato e deixe o dono aplicar. Você é o agente de
contrato, não de implementação alheia.

### 4. Normalizar o handoff fora do protocolo
`.agents/handoffs/onda-3/07-para-11-lgpd-service-fix.md` não tem os campos `Status` e `Prioridade`
que `/AGENTS.md` exige. Isso o torna invisível para qualquer varredura de handoff aberto — inclusive
para o Coordenador decidir se uma onda pode fechar.

Normalize o cabeçalho **sem apagar o conteúdo original** (a regra é: não editar handoff alheio além
do campo `Status`, e adicionar `## Resolução` abaixo, nunca substituir o pedido). Se o item já estiver
resolvido no código, registre a resolução com evidência; se não, deixe `aberto` com prioridade
correta e avise o destinatário.

Aproveite e valide o formato de **todos** os handoffs de `.agents/handoffs/**`, reportando os que não
seguem o protocolo.

### 5. Documentação que reflete o estado real
Três documentos afirmam coisas que precisam ser reconfirmadas contra o código de hoje:
- `docs/ROADMAP-100-STEPS-COMPLETE.md` declara as 10 fases concluídas e `1.0.0-RELEASE-APPROVED` —
  confronte com os bloqueadores ainda abertos em `.agents/completion/01-bloqueadores.md` e corrija a
  afirmação, ou registre a ressalva. Documento que declara conclusão sobre base com débito aberto é
  a forma documental do falso sucesso;
- `docs/index.md` e `docs/README.md` — que apontem para o que existe;
- ADR novo para as decisões estruturais tomadas nas Ondas 6–8 (separação de runtime de workers,
  regra de concorrência ampliada, opt-out unificado), seguindo o padrão dos dois ADRs existentes.

Preserve o histórico: relatório de onda e auditoria antiga descrevem um momento e **não** devem ser
reescritos para parecerem atuais — marque a data e o estado, não apague.

## Mentira mais provável do seu domínio
**Documentação que descreve um endpoint cujo contrato mudou há três ondas** — e que, por estar
escrita com confiança, é usada como verdade pelo próximo agente. A variante mais cara neste
repositório é o documento de conclusão: `ROADMAP-100-STEPS-COMPLETE.md` afirma release aprovado
enquanto `test:integration` e `test:e2e` sequer eram executáveis.

Sua função não é fazer a documentação parecer boa. É fazê-la corresponder.

## LGPD e tenancy no seu domínio
Documentação e exemplo de API **nunca** carregam dado pessoal real — nem em `openapi.yaml`, nem em
exemplo de payload, nem em screenshot. Este repositório já teve telefone real versionado em 7
scripts. Se um endpoint devolve dado pessoal, o documento diz qual base legal o cobre e qual papel
tem acesso — contrato de API é também contrato de privacidade.

## Coordenação
- CI para a verificação de deriva → **08** (`.agents/handoffs/onda-8/18-para-08-<slug>.md`);
- tipos de analytics/BI → **04**;
- consumo dos tipos na tela → **02**;
- contrato de webhook e integração → **06** e **12**;
- contrato de agente e ferramenta → **13**;
- `documentacao-aplicacao/**` e ativos institucionais → **11**;
- `server.ts` → **00**.

## Testes
Cobrir:
- verificação de deriva falha quando uma rota não documentada é adicionada;
- verificação de deriva falha quando um contrato documentado diverge do real;
- tipo unificado de `OverviewMetrics` usado pelas duas pontas, sem duplicata;
- validação de formato de handoff detecta cabeçalho ausente.

## Gate
```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:integration
npm run build
```

Específicos do seu domínio:
```bash
npm run docs
```

Se algum script não existir, siga `/AGENTS.md` → "Scripts ausentes".

## Entrega
Forneça:
- tabela de deriva OpenAPI antes e depois, com o número de divergências;
- a verificação automatizada e a prova de que ela falha quando deve;
- contratos unificados, com os handoffs abertos aos donos;
- varredura de `as any` em limite de contrato, classificada por risco;
- relatório de conformidade de formato de todos os handoffs;
- correção ou ressalva registrada em `ROADMAP-100-STEPS-COMPLETE.md`;
- ADR das decisões estruturais das Ondas 6–8.
