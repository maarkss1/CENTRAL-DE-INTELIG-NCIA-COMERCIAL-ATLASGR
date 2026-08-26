// .dependency-cruiser.cjs
//
// ITEM-13 (dívida técnica) — regras automáticas de dependência entre camadas/domínios.
//
// Este arquivo é o único lugar onde "quem pode importar quem" é decidido em código executável.
// As regras abaixo foram levantadas a partir do código real deste repositório (ver
// `docs/architecture/DEPENDENCY_RULES.md` para o racional de cada uma, incluindo os comandos
// usados para confirmar que a regra reflete o import real e não uma arquitetura imaginada) — não
// são um ideal aspiracional. Uma regra só entra aqui depois de confirmado que o repositório já a
// respeita hoje (ou tem exceção documentada), para o gate nascer verde e travar daqui pra frente,
// não para gerar uma lista de violações pré-existentes sem dono.
//
// Rodar localmente: `npm run lint:architecture` (ou `npx depcruise --config .dependency-cruiser.cjs
// --output-type err src server.ts worker.ts` para o mesmo resultado sem passar pelo script npm).
// Gerar um gráfico para inspeção humana: `npx depcruise --config .dependency-cruiser.cjs
// --output-type dot src server.ts worker.ts | dot -T svg > /tmp/deps.svg` (requer graphviz local,
// não faz parte do gate de CI).

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Dependência circular já é proibida em prosa por src/shared/AGENTS.md ("Não criar ' +
        'dependência circular entre feature e shared") — esta regra generaliza a proibição para ' +
        'todo o grafo de módulos de src/, server.ts e worker.ts, e a torna executável em CI.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-bootstrap-from-outside',
      severity: 'error',
      comment:
        'src/bootstrap/** é a raiz de composição extraída de server.ts no ITEM-07 — cada módulo ' +
        'monta uma fatia do processo Express (segurança, rate limit, rotas, workers, shutdown...) ' +
        'e presume ser chamado uma única vez, na ordem que server.ts define. Uma feature ou lib ' +
        'importando bootstrap/ diretamente reabriria a bagunça que o ITEM-07 resolveu (server.ts ' +
        'com 670+ linhas de composição implícita). Só server.ts (a raiz real) e o próprio ' +
        'bootstrap/ (composição interna, ex.: routes.ts chamando outros bootstrap/*) podem importar ' +
        'daqui.',
      from: {
        pathNot: ['^src/bootstrap/', '^server\\.ts$'],
      },
      to: {
        path: '^src/bootstrap/',
      },
    },
    {
      name: 'not-to-ai-gateway-internals-from-outside',
      severity: 'error',
      comment:
        'src/lib/ai/gateway/** são os internals do gateway de IA extraído no ITEM-09 (circuit ' +
        'breaker, retry, parsing de streaming, providers, redaction...). A fachada pública é ' +
        'src/lib/ai/gateway.ts — features e outras libs importam dali, nunca de dentro da pasta ' +
        'gateway/. Isso mantém o circuit breaker/retry/redaction como comportamento garantido pela ' +
        'fachada, em vez de cada chamador reimplementar (ou esquecer) esses cuidados.',
      from: {
        pathNot: '^src/lib/ai/',
      },
      to: {
        path: '^src/lib/ai/gateway/',
      },
    },
    {
      name: 'no-cross-feature-imports',
      severity: 'error',
      comment:
        'src/features/<nome>/ é um módulo vertical com dono próprio (ver AGENTS.md de cada pasta ' +
        'e docs/architecture/FEATURE-CLASSIFICATION.md). Uma feature não importa internals de ' +
        'outra feature diretamente — isso cria acoplamento sem dono único e reintroduz o "God ' +
        'component" que outras dívidas técnicas deste repo já documentaram (ex.: chatbook, ARCH-002 ' +
        'em docs/auditoria-divida-tecnica/). Composição entre features acontece via src/shared/ ' +
        '(contratos) ou via chamada HTTP à rota da outra feature — nunca via import direto de ' +
        'application/infra/domain de um módulo vizinho. `src/features/notifications/` é a única ' +
        'exceção estrutural: é tratado como serviço transversal (mesmo papel de src/shared/), ' +
        'porque notificação é infraestrutura consumida por natureza por qualquer fluxo de negócio ' +
        '— o único uso real hoje é automations -> notifications ' +
        '(src/features/automations/automation.engine.ts), mas a regra não proíbe o mesmo padrão ' +
        'para outra feature no futuro.',
      from: {
        path: '^src/features/([^/]+)/',
      },
      to: {
        path: '^src/features/([^/]+)/',
        pathNot: ['^src/features/$1/', '^src/features/notifications/'],
      },
    },
    {
      name: 'no-shared-to-features',
      severity: 'error',
      comment:
        'src/shared/AGENTS.md: "contratos compartilhados, policies, tipos de autorização/tenant e ' +
        'utilitários comuns" — shared/ é consumido por features, nunca o contrário, ou vira ' +
        'dependência circular por definição (shared -> feature -> shared). A única exceção real e ' +
        'intencional é src/shared/di/setup.ts: é a raiz de composição do container de injeção de ' +
        'dependência (ver docs/architecture/MATRIZ_ARQUITETURA.md) e por natureza precisa conhecer ' +
        'os repositories/use cases/controllers concretos de cada feature para registrá-los — todo ' +
        'outro arquivo de shared/ segue a regra geral.',
      from: {
        path: '^src/shared/',
        pathNot: '^src/shared/di/setup\\.ts$',
      },
      to: {
        path: '^src/features/',
      },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    exclude: {
      path: [
        'node_modules',
        '(^|/)dist/',
        '(^|/)build/',
        '(^|/)coverage/',
        '(^|/)playwright-report/',
        '(^|/)android/',
        '(^|/)ios/',
        '\\.(test|spec)\\.[jt]sx?$',
        '(^|/)__tests__/',
        '(^|/)tests/',
      ],
    },
    doNotFollow: {
      path: 'node_modules',
    },
  },
};
