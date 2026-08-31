import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api';
import { prisma } from './prisma.js';
import { requestContext } from './async-context.js';
import { parseAllowedOrigins } from '../config/network.js';
import { isAuthorizedLoginEmail, getBrandFromEmail } from '../config/access-policy.js';
import { sendEmail, MailerNotConfiguredError } from './email/mailer.js';
import { logger } from './logger.js';

const ACCESS_DENIED_MESSAGE =
  'Acesso restrito a e-mails corporativos autorizados (@atlasgr.com.br ou @totaltrac.com.br).';

// Bloqueio de conta por tentativas de login malsucedidas — complementa o rate limit por IP
// (AUTH_RATE_LIMIT_MAX/15min, src/bootstrap/rateLimiters.ts) com um limite por CONTA: um
// atacante distribuído por vários IPs contra a MESMA conta (credential stuffing/força bruta
// direcionada) não é contido só pelo limite de IP, que trata cada IP como independente. Mesma
// janela de 15 minutos do rate limit de IP, por consistência — não é um SLA formal.
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const ACCOUNT_LOCKED_MESSAGE =
  'Conta temporariamente bloqueada por excesso de tentativas de login malsucedidas. Tente novamente em alguns minutos ou use "esqueci minha senha".';
// Marca própria no código da APIError que o `before` abaixo lança quando a conta já está
// bloqueada — o `after` (que INCREMENTA o contador a cada falha) precisa reconhecer e ignorar
// essa marca, senão uma tentativa contra uma conta JÁ bloqueada re-incrementaria o contador (e
// empurraria `lockedUntil` pra sempre mais longe) a cada nova tentativa recebida enquanto
// bloqueada, em vez de só a primeira leva de MAX_FAILED_LOGIN_ATTEMPTS contar.
const ACCOUNT_LOCKED_ERROR_CODE = 'ACCOUNT_LOCKED';

const socialProviders = {
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      }
    : {}),
  ...(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
    ? {
        microsoft: {
          clientId: process.env.MICROSOFT_CLIENT_ID,
          clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        },
      }
    : {}),
};

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || undefined,
  secret: process.env.BETTER_AUTH_SECRET || undefined,
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  // SEC-006 (Sprint 01/Onda 13): o túnel de dev (loca.lt) só é uma origem confiável fora de
  // produção — antes, ele era adicionado incondicionalmente, então essa origem específica
  // também era aceita em produção, ampliando a superfície de CSRF/origin-spoofing sem
  // necessidade (nenhum fluxo de produção depende de um túnel de desenvolvimento).
  trustedOrigins: [
    ...parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
    ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL.replace(/\/$/, '')] : []),
    ...(process.env.NODE_ENV === 'production' ? [] : ['https://atlasgr-dev-server.loca.lt']),
    // GitHub Codespaces expõe a porta local por uma URL https dinâmica, diferente em cada
    // Codespace (<CODESPACE_NAME>-<porta>.<domínio-de-forwarding>, ambos injetados
    // automaticamente pelo Codespaces). .env.example fixa ALLOWED_ORIGINS/BETTER_AUTH_URL em
    // localhost:PORT — sem esta entrada, o Origin real enviado pelo navegador ao abrir a URL
    // forwarded nunca bate com trustedOrigins, e o better-auth rejeita todo login/cadastro com
    // "Invalid origin" (ver node_modules/better-auth/dist/api/middlewares/origin-check.mjs).
    ...(process.env.NODE_ENV !== 'production' && process.env.CODESPACE_NAME
      ? [
          `https://${process.env.CODESPACE_NAME}-${process.env.PORT || '3005'}.${
            process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev'
          }`,
        ]
      : []),
  ],
  emailAndPassword: {
    enabled: true,
    // SEC-006 (Sprint 01/Onda 13): sem isto, um reset de senha por e-mail (ex.: após a conta
    // ser comprometida, exatamente o cenário em que reset é usado) deixava sessões antigas —
    // em outros dispositivos/navegadores — válidas até expirarem naturalmente (7 dias). Um
    // atacante com uma sessão já aberta continuava com acesso mesmo depois da vítima trocar a
    // senha.
    revokeSessionsOnPasswordReset: true,
    // Sem isto, POST /api/auth/request-password-reset responde "Reset password isn't enabled"
    // (ver node_modules/better-auth/dist/api/routes/password.mjs) — o endpoint só existe de
    // verdade quando um envio de e-mail é fornecido.
    sendResetPassword: async ({ user, url }) => {
      try {
        await sendEmail({
          to: user.email,
          subject: 'Redefinição de senha — Prospector Atlas',
          text: [
            `Olá${user.name ? `, ${user.name}` : ''},`,
            '',
            'Recebemos uma solicitação para redefinir a senha da sua conta no Prospector Atlas.',
            '',
            `Clique no link abaixo para escolher uma nova senha (válido por 1 hora):`,
            url,
            '',
            'Se você não solicitou essa alteração, ignore este e-mail — sua senha atual continua válida.',
          ].join('\n'),
        });
      } catch (error) {
        if (error instanceof MailerNotConfiguredError) {
          logger.warn(
            { email: user.email, url },
            'Reset de senha solicitado, mas SMTP não está configurado. O link é: ' + url,
          );
          throw new APIError('INTERNAL_SERVER_ERROR', {
            message:
              'Serviço de e-mail não configurado. Não é possível enviar o link de redefinição.',
          });
        }
        logger.error(
          { err: error, email: user.email },
          'Falha ao enviar e-mail de redefinição de senha.',
        );
        throw new APIError('INTERNAL_SERVER_ERROR', {
          message: 'Falha ao enviar e-mail de redefinição.',
        });
      }
    },
  },
  socialProviders,
  plugins: [],
  hooks: {
    // Roda ANTES do better-auth verificar a senha — barra a tentativa (e evita o custo de
    // hashing) sem sequer chamar `password.verify` quando a conta já está bloqueada.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-in/email') return;
      const email = typeof ctx.body?.email === 'string' ? ctx.body.email.toLowerCase() : null;
      if (!email) return;

      const user = await prisma.user.findUnique({
        where: { email },
        select: { lockedUntil: true },
      });
      if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
        throw new APIError('FORBIDDEN', {
          message: ACCOUNT_LOCKED_MESSAGE,
          code: ACCOUNT_LOCKED_ERROR_CODE,
        });
      }
    }),
    // Roda DEPOIS do resultado (sucesso ou falha) já estar decidido — incrementa/zera o
    // contador. `ctx.context.returned` é a instância de APIError quando a tentativa falhou
    // (senha errada, usuário inexistente), ou a sessão/usuário criados quando teve sucesso —
    // mesmo mecanismo que `getEndpointResponse` do próprio better-auth usa internamente.
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-in/email') return;
      const email = typeof ctx.body?.email === 'string' ? ctx.body.email.toLowerCase() : null;
      if (!email) return;

      const returned = ctx.context.returned;
      const failed = isAPIError(returned);
      // Já barrado pelo `before` acima (conta já bloqueada) — não reconta nem empurra
      // `lockedUntil` mais pra frente a cada nova tentativa recebida enquanto bloqueada.
      if (failed && returned.body?.code === ACCOUNT_LOCKED_ERROR_CODE) return;

      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, failedLoginAttempts: true },
      });
      // Não revela se o e-mail existe (mesma resposta genérica de "Invalid email or
      // password" do better-auth já cobre isso) — sem usuário, não há o que atualizar.
      if (!user) return;

      if (failed) {
        const attempts = user.failedLoginAttempts + 1;
        const shouldLock = attempts >= MAX_FAILED_LOGIN_ATTEMPTS;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: attempts,
            ...(shouldLock ? { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS) } : {}),
          },
        });
      } else if (user.failedLoginAttempts > 0) {
        // Login bem-sucedido zera o contador — o titular real digitando a senha certa
        // não deve ficar acumulando "quase bloqueios" de tentativas erradas antigas.
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockedUntil: null },
        });
      }
    }),
  },
  // Hardening explícito em vez de depender apenas dos defaults da biblioteca
  // (que variam de comportamento conforme NODE_ENV — ver ADR sobre bypass de dev).
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 dias
    updateAge: 60 * 60 * 24, // renova a sessão a cada 24h de uso
  },
  advanced: {
    useSecureCookies: Boolean(
      process.env.SECURE_COOKIES === 'true' ||
      (process.env.BETTER_AUTH_URL && process.env.BETTER_AUTH_URL.startsWith('https://')),
    ),
    crossSubDomainCookies: {
      enabled: Boolean(process.env.COOKIE_DOMAIN),
      domain: process.env.COOKIE_DOMAIN,
    },
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
      secure: Boolean(
        process.env.SECURE_COOKIES === 'true' ||
        (process.env.BETTER_AUTH_URL && process.env.BETTER_AUTH_URL.startsWith('https://')),
      ),
    },
  },
  user: {
    additionalFields: {
      // input: false — sem isso, qualquer usuário autenticado podia chamar
      // authClient.updateUser({ role: 'ADMIN' }) e se auto-promover (o hook
      // databaseHooks.user.update.before só valida o e-mail, nunca o role).
      // Mudança de role passa a exigir uma ação administrativa fora do self-service
      // do usuário (hoje, direto no banco; ver POST /api/auth-extra/change-password
      // para o único outro campo administrado por fora do fluxo normal).
      role: {
        type: 'string',
        defaultValue: 'VISUALIZADOR',
        input: false,
      },
      organizationId: {
        type: 'string',
        required: false,
        input: false,
      },
      // O próprio usuário PODE limpar essa flag (input: true, padrão) — é exatamente
      // o que a tela de troca de senha obrigatória faz depois de uma troca bem-sucedida.
      mustChangePassword: {
        type: 'boolean',
        defaultValue: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!isAuthorizedLoginEmail(user.email)) {
            throw new APIError('FORBIDDEN', {
              message: ACCESS_DENIED_MESSAGE,
            });
          }

          // Create an organization if one isn't provided (during registration / Google OAuth)
          if (!user.organizationId) {
            const brand = getBrandFromEmail(user.email);
            const brandTitle = brand === 'totaltrac' ? 'Total Trac Operações' : 'AtlasGR Operações';
            // O middleware de /api/auth (server.ts) já roda toda esta rota sob
            // requestContext.run({ bypassRls: true }, ...) — sem tenant conhecido ainda,
            // o INSERT nesta Organization (e, logo em seguida, o de User) só passa pela
            // policy de RLS via esse bypass ou via app.current_tenant_id = id/organizationId.
            // Geramos o id aqui, antes do insert, e usamos ele mesmo como tenantId do
            // contexto (a organização "é dona de si mesma" nesse instante) — igual ao
            // padrão já usado em tests/helpers/integration-setup.ts pro seed de teste.
            // enterWith (em vez de run) de propósito: precisa continuar valendo depois que
            // este hook retornar, quando o adapter do better-auth insere a linha de `user`
            // com esse organizationId na sequência, dentro da mesma cadeia assíncrona.
            // IMPORTANTE: preserva o bypassRls do contexto atual — enterWith SUBSTITUI a
            // store inteira, então um `enterWith({ tenantId: orgId })` sem isso derrubava
            // silenciosamente o bypassRls:true do middleware pelo resto da requisição,
            // quebrando operações posteriores do better-auth nessa mesma cadeia assíncrona
            // que dependem dele (ex.: gravação em "verification", cuja policy de RLS só
            // libera INSERT com app.bypass_rls='on' — não tem o escape `WITH CHECK (true)`
            // que "session"/"account" têm).
            const orgId = randomUUID();
            const bypassRls = requestContext.getStore()?.bypassRls;
            requestContext.enterWith({ tenantId: orgId, bypassRls });
            const org = await prisma.organization.create({
              data: { id: orgId, name: `${user.name || 'Novo Usuário'} - ${brandTitle}` },
            });
            // Quem cria uma organização NOVA vira ADMIN dela — sem isso, `role` cai no
            // default do schema (VISUALIZADOR, somente-leitura, ver additionalFields
            // abaixo) e essa pessoa fica travada para sempre: é a ÚNICA usuária da
            // organização, então não existe nenhum ADMIN capaz de promovê-la depois via
            // `team.routes.ts` (rota já corrigida para exigir `requireRole(['ADMIN'])`
            // em toda escrita — ver auditoria de autorização da Onda 1). Um convite para
            // uma organização JÁ existente (branch abaixo, `user.organizationId` já
            // presente) continua caindo no default/no papel que o convite atribuir —
            // isso aqui só cobre quem está fundando a organização agora.
            return {
              data: {
                ...user,
                organizationId: org.id,
                role: 'ADMIN',
              },
            };
          }
          return { data: user };
        },
      },
      update: {
        before: async (user) => {
          if (user.email && !isAuthorizedLoginEmail(user.email)) {
            throw new APIError('FORBIDDEN', {
              message: ACCESS_DENIED_MESSAGE,
            });
          }

          return { data: user };
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { email: true },
          });

          // Se o usuário já existe e o email não é autorizado, bloqueia.
          // Se o usuário não existe no DB ainda (pode estar na transação de signup), permite.
          if (user && !isAuthorizedLoginEmail(user.email)) {
            throw new APIError('FORBIDDEN', {
              message: ACCESS_DENIED_MESSAGE,
            });
          }

          // No session-count limit is applied: the authorized account may
          // remain signed in on multiple browsers/devices simultaneously.
          return { data: session };
        },
      },
    },
  },
});
