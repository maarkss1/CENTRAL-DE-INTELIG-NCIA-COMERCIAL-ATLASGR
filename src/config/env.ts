import { z } from 'zod';
import 'dotenv/config';
import { logger } from '../lib/logger.js';

const envSchema = z.object({
  // Sem default: um deployment que esqueça de definir NODE_ENV deve falhar ao subir
  // em vez de silenciosamente assumir 'development' (e, com isso, habilitar bypasses
  // de autenticação e CORS permissivo destinados apenas a ambiente local).
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.string().default('3005'),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  REDIS_URL: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  BETTER_AUTH_URL: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().optional(),
  // Chave mestra (32 bytes, base64) que cifra em repouso credenciais de integrações persistidas
  // no banco (GoogleWorkspaceConnection.accessToken/refreshToken, BitrixConnection.webhookUrl —
  // ver src/lib/crypto/secretFields.ts). Separada de BETTER_AUTH_SECRET de propósito: uma chave
  // comprometida não deve automaticamente comprometer a outra. Opcional aqui (mesmo padrão de
  // BETTER_AUTH_SECRET) — a obrigatoriedade em produção é reforçada em runtime por
  // secretFields.ts, não aqui, para não derrubar a aplicação inteira ao subir só por causa deste
  // schema quando NODE_ENV ainda não foi resolvido nesta camada.
  CREDENTIALS_ENCRYPTION_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  MEILI_MASTER_KEY: z.string().optional(),
  MEILI_HOST: z.string().optional(),
  PROSPECTING_PROVIDER_MODE: z.enum(['free', 'hybrid']).default('free'),
  CNPJ_PROVIDER: z.enum(['brasilapi']).default('brasilapi'),
  // Default seguro (fail-closed): o bypass de autenticação de desenvolvimento só
  // deve ficar ativo quando alguém define ALLOW_DEV_AUTH_BYPASS=true explicitamente.
  ALLOW_DEV_AUTH_BYPASS: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),
  AI_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  // Orçamento mensal de IA (USD), só para observabilidade (métrica `ai_usage_budget_usd_total` em
  // src/lib/ai/metrics.ts, consumida pelo alerta AIBudgetOverrun em
  // infrastructure/observability/alert.rules.yml). Não existia nenhum conceito de orçamento no
  // código antes desta variável (ver handoff .agents/handoffs/onda-4/10-para-07-metricas-fila-
  // orcamento-ia.md) — nenhum bloqueio de chamada de IA depende dela hoje, é só o valor de
  // referência que o painel/alerta compara contra o custo estimado acumulado (AILog/
  // ai_usage_cost_usd_total). Opcional e sem default: sem configurar, a métrica de orçamento
  // simplesmente não é publicada em /metrics (evita um "0" fabricado que faria a divisão
  // custo/orçamento do alerta virar +Inf a qualquer custo real, um falso positivo).
  AI_MONTHLY_BUDGET_USD: z.coerce.number().positive().optional(),
  // 20/15min por IP é apertado o bastante pra conter força bruta/credential stuffing, mas também
  // apertado demais pra uma suíte E2E que cria uma conta real por teste sequencialmente a partir
  // do mesmo IP (ver server.ts authLimiter) — configurável para o ambiente de CI poder abrir a
  // cota sem enfraquecer o valor padrão de produção.
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  JSON_BODY_LIMIT: z.string().default('2mb'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  EXPOSE_METRICS: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  ENABLE_SEARCH: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  // DOC-002: documentação OpenAPI (/api-docs, Swagger UI). Default false — a rota só é montada
  // explicitamente (ver server.ts), nunca implicitamente por NODE_ENV !== 'production' sozinho.
  EXPOSE_API_DOCS: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),

  // ── SDR de voz (Birth Voices Hub) ────────────────────────────────────────
  // Todas opcionais: sem elas a integração fica inerte (nenhuma ligação é disparada e o webhook
  // responde 503), em vez de impedir a aplicação inteira de subir.
  BIRTH_VOICES_URL: z.string().url().optional(),
  BIRTH_VOICES_API_KEY: z.string().optional(),
  BIRTH_VOICES_AGENT_ID: z.string().optional(),
  // Segredo compartilhado que valida a assinatura HMAC dos webhooks de resultado da ligação.
  BIRTH_VOICES_WEBHOOK_SECRET: z.string().optional(),
  // URL pública desta aplicação — é o endereço que mandamos ao Birth Voices Hub para ele nos
  // devolver o resultado da chamada, então precisa ser alcançável de fora.
  PUBLIC_BASE_URL: z.string().url().optional(),

  // ── Prospecção fria (discagem automática) ────────────────────────────────
  // Duas chaves independentes para ligar: o booleano E a lista de organizações. Discar para quem
  // nunca pediu contato é a operação mais arriscada do sistema — habilitar por engano tem que ser
  // difícil, então nenhuma das duas sozinha basta.
  SDR_COLD_CALL_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  /** Ids de organização separados por vírgula. Vazio = ninguém, mesmo com a flag acima ligada. */
  SDR_COLD_CALL_ORGANIZATIONS: z.string().optional(),
  // Janela de discagem no fuso do destinatário. O fim é exclusivo: 18 significa "até 17:59".
  SDR_CALL_WINDOW_START: z.coerce.number().int().min(0).max(23).default(9),
  SDR_CALL_WINDOW_END: z.coerce.number().int().min(1).max(24).default(18),
  SDR_CALL_TIMEZONE: z.string().default('America/Sao_Paulo'),
  SDR_MAX_CALLS_PER_RUN: z.coerce.number().int().positive().default(10),
  SDR_MAX_ATTEMPTS_PER_LEAD: z.coerce.number().int().positive().default(3),

  // Segredo do webhook /api/webhooks/voice-result (Bland AI). Fail-closed: sem ele o webhook
  // responde 503 (ver voiceResult.webhook.ts) — nunca cai para um valor default versionado.
  ATLASGR_WEBHOOK_SECRET: z.string().optional(),

  // ── Telefonia PABX 3CX ────────────────────────────────────────────────────
  // Segredo compartilhado que valida a assinatura HMAC do webhook de eventos de chamada do 3CX
  // (mesmo esquema do BIRTH_VOICES_WEBHOOK_SECRET). Sem ele o webhook fica fail-closed (503):
  // quem chama esse endpoint não passa por authenticateToken (é o PABX do cliente, não um usuário
  // logado), então sem assinatura qualquer um que descobrisse a URL poderia injetar eventos falsos.
  THREECX_WEBHOOK_SECRET: z.string().optional(),
  SDR_RETRY_COOLDOWN_HOURS: z.coerce.number().int().positive().default(48),

  // ── Enxame autônomo (24h, sem gatilho humano) ────────────────────────────
  // Mesmo padrão de dois-fatores da prospecção fria acima: nem toda organização deve ganhar um
  // agente rodando sozinho por padrão. E, diferente da discagem fria, o enxame autônomo nunca
  // executa uma ação real por conta própria — ele só PROPÕE, gravando uma AIPendingAction que
  // um humano precisa aprovar (ver swarmScheduler.service.ts e aiPendingAction.service.ts, que já
  // trata qualquer `action` sem executor conhecido como "unsupported_action").
  SWARM_SCHEDULER_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  /** Ids de organização separados por vírgula. Vazio = ninguém, mesmo com a flag acima ligada. */
  SWARM_SCHEDULER_ORGANIZATIONS: z.string().optional(),
  SWARM_SCHEDULER_MAX_LEADS_PER_RUN: z.coerce.number().int().positive().default(5),
  // supervised: analisa e deixa ações na caixa de aprovação. full: também pode executar o primeiro
  // e-mail, mas somente com organização autorizada, score mínimo e dentro da janela comercial.
  SWARM_AUTONOMY_MODE: z.enum(['supervised', 'full']).default('supervised'),
  SWARM_AUTONOMOUS_MIN_SCORE: z.coerce.number().int().min(0).max(100).default(80),
  SWARM_NEW_LEAD_GRACE_MINUTES: z.coerce.number().int().positive().default(30),
  SWARM_STALE_PIPELINE_HOURS: z.coerce.number().int().positive().default(72),
  SWARM_STALE_PROPOSAL_HOURS: z.coerce.number().int().positive().default(48),
  SWARM_RECOMMENDATION_COOLDOWN_HOURS: z.coerce.number().int().positive().default(24),

  // ── Envio real de e-mail (executor de AIPendingAction) ───────────────────
  // Todas opcionais: sem SMTP_HOST, o mailer fica inerte — "aprovar" volta a só abrir o cliente
  // de e-mail do usuário (mailto:), em vez de falhar a aplicação inteira ao subir.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  /** Endereço "De" usado no envio — cai para SMTP_USER quando ausente. */
  SMTP_FROM: z.string().optional(),

  // ── Retenção de histórico de extrações Bitrix (BitrixExtractionRun) ─────
  // Onda 6, Agente 01A: o schema não precisa esperar a decisão humana de prazo pra existir, só o
  // parâmetro. Mesmo padrão de janela já usado no worker de anonimização de leads desqualificados
  // (autoAnonymizeDisqualified.worker.ts, 90 dias hardcoded) — aqui o valor é configurável em vez
  // de fixo no código, e o worker de expurgo correspondente fica DESLIGADO por padrão (mesmo
  // padrão de dois-fatores do SDR/enxame acima: a flag sozinha não move nada sem esta variável, e
  // o valor de dias sozinho não expurga nada sem a flag). Pendente de confirmação humana sobre o
  // número — ver .agents/handoffs/onda-6/01A-para-06-bitrix-extraction-run-schema.md.
  BITRIX_EXTRACTION_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  BITRIX_EXTRACTION_PURGE_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  // Onda 7, Agente 06: diretório onde os arquivos gerados pelo serviço real de extração
  // (CSV/XLSX/JSON) ficam em disco, fora do controle de versão (ver .gitignore). Mesma limitação
  // conhecida já documentada para a sessão do WhatsApp (Integrations.tsx): no plano free do Render
  // (ver render.yaml) o disco não é persistente entre reinícios/hibernação — um arquivo gerado
  // pode deixar de existir depois de um restart, mesmo com o histórico (BitrixExtractionRun)
  // continuando íntegro no Postgres. O download trata isso como 410 (não como erro silencioso),
  // nunca finge que o arquivo ainda existe.
  BITRIX_EXTRACTION_STORAGE_DIR: z.string().default('./data/bitrix-extractions'),
})
  // Uma janela invertida (início 18, fim 9) nunca deixaria a campanha rodar, e o sintoma seria
  // "o SDR não liga" — muito mais difícil de diagnosticar do que uma falha na subida.
  .refine((cfg) => cfg.SDR_CALL_WINDOW_START < cfg.SDR_CALL_WINDOW_END, {
    message: 'SDR_CALL_WINDOW_START precisa ser menor que SDR_CALL_WINDOW_END',
    path: ['SDR_CALL_WINDOW_START'],
  });

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  logger.error({ errors: _env.error.format() }, '❌ Erro de Validação nas Variáveis de Ambiente');
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}

// Trava de segurança: nunca subir em produção com o bypass de autenticação ativo,
// mesmo que alguma configuração/segredo tenha ativado a flag por engano.
if (_env.success && _env.data.NODE_ENV === 'production' && _env.data.ALLOW_DEV_AUTH_BYPASS) {
  logger.error('❌ ALLOW_DEV_AUTH_BYPASS=true não é permitido com NODE_ENV=production. Abortando inicialização.');
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}

// Tipado como o schema (não `NodeJS.ProcessEnv`): no caminho de sucesso (o único que importa em
// produção — o de falha sempre encerra o processo antes de chegar aqui, exceto em NODE_ENV=test)
// os valores já vêm com default/coerce/transform aplicados pelo Zod. Sem este cast, `env` virava
// uma união com `NodeJS.ProcessEnv` (todos os campos `string | undefined`), o que apagava os tipos
// corretos (number, boolean) em todo lugar que consome `env` e mascarava erros de tipo reais.
export const env: z.infer<typeof envSchema> = _env.success ? _env.data : (process.env as unknown as z.infer<typeof envSchema>);
