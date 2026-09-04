// Cenario de carga para rotas AUTENTICADAS reais do CRM (Onda 42, dossie CPI DEC-20 opcao A:
// "vale investir em cenarios de carga reais agora").
//
// Cobre o debito registrado em docs/development/PERFORMANCE_BUDGETS.md secao 2 ("Debito derivado
// (nao resolvido neste item)") e no cabecalho de tests/load/k6-api.js: nenhum cenario k6 exercitava
// autenticacao/RBAC/RLS de verdade — so /health/live e /health/ready, que nao passam por
// authenticateToken nem por requireTenant. Sem isso, o overhead real de
// authenticateToken -> auth.api.getSession() -> requireTenant -> requireRole -> RLS do Postgres
// (app.current_tenant_id) nunca era medido sob carga, mesmo sendo onde boa parte do custo real de
// uma rota transacional do CRM esta.
//
// ─── Por que login real, e nao um "bypass" de auth ────────────────────────────────────────────
// ALLOW_DEV_AUTH_BYPASS (src/config/env.ts) existe no schema e e usado como trava de seguranca
// (nunca pode ficar true com NODE_ENV=production), mas — verificado nesta rodada, grep completo em
// src/ — NENHUM middleware de fato leem essa flag para pular autenticacao; ela nao implementa
// nenhum atalho de sessao hoje. PLATFORM_OPERATOR_TOKEN (src/shared/middlewares/
// requirePlatformOperator.ts) tambem nao serve para isso: e uma segunda trava para superficies de
// infraestrutura compartilhada entre tenants (BullBoard, /metrics), nao concede sessao de usuario
// nem passa por authenticateToken/requireTenant/RBAC de negocio. Usar qualquer um dos dois aqui
// simularia menos, nao mais, do overhead real de middleware que este cenario existe para medir.
//
// Por isso o setup() abaixo faz o MESMO caminho que um usuario real percorre: POST
// /api/auth/sign-up/email (Better Auth, mesma rota que tests/e2e/helpers.ts usa via formulario) —
// cria Organization + User ADMIN reais e devolve um cookie de sessao real
// (better-auth.session_token) — e reusa esse cookie em todas as VUs pelo resto do teste. Login real
// uma vez em setup(), nao a cada iteracao: hashing de senha (bcrypt/argon2, conforme configuracao
// do Better Auth) e caro de proposito para autenticacao, e um usuario real da plataforma tambem loga
// uma vez e faz muitas requisicoes depois — repetir sign-up/login em toda iteracao mediria o custo
// de hashing de senha, nao a latencia das rotas transacionais que este cenario quer medir.
//
// ─── Rotas escolhidas (representativas do dia a dia comercial) ───────────────────────────────
//   1. GET /api/leads       — listagem do pipeline com paginacao/filtro (funnel/status), a tela
//      que um SDR/Closer mais usa durante o dia.
//   2. GET /api/companies   — listagem/busca de empresas (?q=), usada o dia inteiro para localizar
//      uma conta antes de criar lead/atividade.
//   3. POST /api/activities — criacao de atividade (ligacao/reuniao/tarefa) vinculada a um lead
//      existente — escrita frequente do uso diario.
//
// ─── Volume de dados seedado ───────────────────────────────────────────────────────────────────
// setup() cria 400 empresas e 400 leads reais (via POST autenticado, nao INSERT direto no banco —
// passa pelas mesmas validacoes/RLS que a carga vai exercitar depois) antes da fase de medicao. Uma
// empresa por lead de proposito (ver comentario em COMPANY_SEED_COUNT abaixo) — LeadUseCases.
// createLead bloqueia um segundo lead para a mesma empresa no mesmo funil. Esse volume e MENOR que
// um tenant real maduro (que pode ter milhares de leads/empresas) — ver o relatorio em
// .agents/handoffs/onda-42/10-relatorio-latencia-p50-p95-p99.md para a ressalva sobre volume nao
// ser escala de producao.
//
// ─── Uso local ──────────────────────────────────────────────────────────────────────────────
//   1. Suba a app real contra Postgres+Redis de teste (mesmo processo que tests/e2e usa):
//        npx dotenv-cli -o -e .env.load-test -- npx tsx server.ts
//      (.env.load-test: copia de .env.test.example com API_RATE_LIMIT_MAX bem mais alto — ver
//      README no proprio arquivo/relatorio da Onda 42: o apiLimiter de src/bootstrap/
//      rateLimiters.ts e por IP, 600 req/15min por padrao, e uma carga k6 rodando de UMA maquina
//      bate nesse teto em segundos, tornando os resultados uma parede de 429 em vez de latencia
//      real. Isso nunca acontece em producao real, onde o trafego vem de IPs de clientes distintos.)
//   2. k6 run tests/load/k6-crm-authenticated.js --env BASE_URL=http://localhost:3000
//
// Uso em CI: ver o job dedicado em .github/workflows/endpoint-latency-budget.yml (roda depois do
// cenario de health check, mesma app/mesmos service containers).
import http from 'k6/http';
import { check, sleep, group } from 'k6';

export const options = {
  scenarios: {
    crm_authenticated: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 5 },
        { duration: '45s', target: 5 },
        { duration: '15s', target: 0 },
      ],
      exec: 'default',
    },
  },
  setupTimeout: '120s',
  thresholds: {
    // Menos de 1% de falha no total — mesmo padrao de tests/load/k6-api.js.
    http_req_failed: ['rate<0.01'],
    // p50/p95/p99 por rota (tag `endpoint`), nao so um numero "rode e veja". p95 usa diretamente o
    // SLO ja documentado em docs/SRE.md 1.2 (95% das rotas transacionais < 500ms); p99 usa o proprio
    // teto de "Aviso" do mesmo documento (P95 > 800ms por 15min dispara alerta).
    'http_req_duration{endpoint:leads_list}': ['p(50)<200', 'p(95)<500', 'p(99)<800'],
    'http_req_duration{endpoint:companies_list}': ['p(50)<200', 'p(95)<500', 'p(99)<800'],
    'http_req_duration{endpoint:activity_create}': ['p(50)<200', 'p(95)<500', 'p(99)<800'],
  },
};

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';

const SESSION_COOKIE_NAME = 'better-auth.session_token';
// 1 empresa por lead de proposito, nao um pool menor reaproveitado com modulo: LeadUseCases.
// createLead (src/features/crm/application/LeadUseCases.ts) bloqueia um segundo lead para a MESMA
// empresa no MESMO funil (409 "Esta empresa já tem um lead capturado por..."), regra de negócio
// real (evita dois vendedores capturarem a mesma conta) — descoberta rodando este script pela
// primeira vez contra a app real com um pool de 40 empresas para 400 leads (360 dos 400 POSTs de
// seed voltaram 409). Com 1 empresa por lead essa colisão nunca acontece.
const COMPANY_SEED_COUNT = 400;
const LEAD_SEED_COUNT = 400;
const LEAD_SEED_BATCH_SIZE = 20;

const LEAD_STATUS_POOL = [
  'Lead Recebido',
  'Qualificação (SDR)',
  'Reunião Agendada',
  'Nova Oportunidade',
  'Proposta Enviada',
  'Negócios Ganhos',
];
const FUNNEL_POOL = ['Lead', 'Negocio'];
const ACTIVITY_TYPE_POOL = ['Ligação', 'WhatsApp', 'E-mail', 'Follow-up'];

function jsonHeaders(cookie) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
  };
}

/**
 * Extrai o valor bruto (ainda url-encoded, exatamente como o Better Auth manda no Set-Cookie) do
 * cookie de sessao. Reenviar o mesmo valor bruto no header `Cookie` de requisicoes futuras e o
 * comportamento real de um navegador (ele nunca decodifica o valor armazenado, so ecoa de volta o
 * que recebeu) — confirmado manualmente com curl -b/-c contra a app real antes de escrever este
 * script.
 */
function extractSessionCookie(response) {
  const setCookieHeader = response.headers['Set-Cookie'];
  if (!setCookieHeader) return null;
  const match = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(setCookieHeader);
  return match ? match[1] : null;
}

function uniqueEmail() {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return `k6-load-${unique}@atlasgr.com.br`;
}

export function setup() {
  const email = uniqueEmail();
  // Organization.name e @unique (prisma/schema.prisma) e o hook de signup (src/lib/auth.ts) deriva
  // o nome da org a partir de `name` — mesmo bug real ja documentado em tests/e2e/helpers.ts
  // (uniqueTestEmail/signUp): um `name` fixo faz toda segunda execucao deste script colidir na
  // constraint unica. `name` precisa ser unico por execucao, nao so o `email`.
  const signUpRes = http.post(
    `${baseUrl}/api/auth/sign-up/email`,
    JSON.stringify({ email, password: 'K6LoadTest123!', name: `K6 Load Test ${email}` }),
    { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'auth_signup' } },
  );

  const signedUp = check(signUpRes, {
    'sign-up real respondeu 200': (res) => res.status === 200,
  });
  if (!signedUp) {
    throw new Error(`Falha no sign-up de setup (status ${signUpRes.status}): ${signUpRes.body}`);
  }

  const cookie = extractSessionCookie(signUpRes);
  if (!cookie) {
    throw new Error('Sign-up respondeu 200 mas nao trouxe cookie de sessao (better-auth.session_token).');
  }
  const headers = jsonHeaders(cookie);

  // Seed de empresas (paralelo, em lotes) — dados reais criados via API autenticada, nao INSERT
  // direto, para que o seed em si tambem passe pela mesma validacao/RLS que a fase de medicao.
  const companyRequests = [];
  for (let i = 0; i < COMPANY_SEED_COUNT; i++) {
    companyRequests.push([
      'POST',
      `${baseUrl}/api/companies`,
      JSON.stringify({
        legalName: `K6 Load Empresa ${i} LTDA`,
        tradeName: `K6 Load ${i}`,
        segment: i % 3 === 0 ? 'Logística' : i % 3 === 1 ? 'Varejo' : 'Indústria',
      }),
      { headers, tags: { endpoint: 'setup_seed_company' } },
    ]);
  }
  const companyResponses = http.batch(companyRequests);
  const companyIds = companyResponses
    .filter((res) => res.status === 201)
    .map((res) => res.json('data.id'));

  if (companyIds.length === 0) {
    throw new Error('Seed de empresas falhou completamente — nenhuma empresa criada em setup().');
  }

  // Seed de leads em lotes de LEAD_SEED_BATCH_SIZE (paralelo dentro do lote, sequencial entre
  // lotes) — cria um volume real de dados para a listagem paginada exercitar de verdade, sem
  // estourar o timeout de setup() nem o rate limiter numa unica rajada gigante.
  const leadIds = [];
  for (let batchStart = 0; batchStart < LEAD_SEED_COUNT; batchStart += LEAD_SEED_BATCH_SIZE) {
    const leadRequests = [];
    for (let i = batchStart; i < Math.min(batchStart + LEAD_SEED_BATCH_SIZE, LEAD_SEED_COUNT); i++) {
      leadRequests.push([
        'POST',
        `${baseUrl}/api/leads`,
        JSON.stringify({
          // 1:1 com companyIds (ver comentario em COMPANY_SEED_COUNT) — nunca reaproveita a mesma
          // empresa para dois leads do mesmo funil.
          companyId: companyIds[i % companyIds.length],
          source: 'k6-load-seed',
          funnel: FUNNEL_POOL[i % FUNNEL_POOL.length],
          status: LEAD_STATUS_POOL[i % LEAD_STATUS_POOL.length],
          temperature: i % 2 === 0 ? 'Morno' : 'Quente',
        }),
        { headers, tags: { endpoint: 'setup_seed_lead' } },
      ]);
    }
    const leadResponses = http.batch(leadRequests);
    for (const res of leadResponses) {
      if (res.status === 201) leadIds.push(res.json('data.id'));
    }
  }

  if (leadIds.length === 0) {
    throw new Error('Seed de leads falhou completamente — nenhum lead criado em setup().');
  }

  return { cookie, companyIds, leadIds };
}

export default function (data) {
  const headers = jsonHeaders(data.cookie);

  group('pipeline_listagem', () => {
    const page = 1 + Math.floor(Math.random() * 5);
    const funnel = FUNNEL_POOL[Math.floor(Math.random() * FUNNEL_POOL.length)];
    const res = http.get(`${baseUrl}/api/leads?page=${page}&limit=25&funnel=${funnel}`, {
      headers,
      tags: { endpoint: 'leads_list' },
    });
    check(res, {
      'GET /api/leads responde 200': (r) => r.status === 200,
      'GET /api/leads devolve meta de paginacao': (r) => r.json('meta.total') !== undefined,
    });
  });

  group('empresas_busca', () => {
    const page = 1 + Math.floor(Math.random() * 3);
    const res = http.get(`${baseUrl}/api/companies?page=${page}&limit=25&q=K6`, {
      headers,
      tags: { endpoint: 'companies_list' },
    });
    check(res, { 'GET /api/companies responde 200': (r) => r.status === 200 });
  });

  group('atividade_criar', () => {
    const leadId = data.leadIds[Math.floor(Math.random() * data.leadIds.length)];
    const activityType = ACTIVITY_TYPE_POOL[Math.floor(Math.random() * ACTIVITY_TYPE_POOL.length)];
    const res = http.post(
      `${baseUrl}/api/activities`,
      JSON.stringify({
        type: activityType,
        owner: 'K6 Load Test',
        date: new Date().toISOString().slice(0, 10),
        leadId,
      }),
      { headers, tags: { endpoint: 'activity_create' } },
    );
    check(res, { 'POST /api/activities responde 201': (r) => r.status === 201 });
  });

  sleep(1);
}
