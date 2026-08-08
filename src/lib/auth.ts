import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { prisma } from "./prisma.js";
import { requestContext } from "./async-context.js";
import { parseAllowedOrigins } from "../config/network.js";
import { isAuthorizedLoginEmail, getBrandFromEmail } from "../config/access-policy.js";

const ACCESS_DENIED_MESSAGE = "Acesso restrito a e-mails corporativos autorizados (@atlasgr.com.br ou @totaltrac.com.br).";

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
        provider: "postgresql",
    }),
    trustedOrigins: [...parseAllowedOrigins(process.env.ALLOWED_ORIGINS), "https://atlasgr-dev-server.loca.lt"],
    emailAndPassword: {
        enabled: true,
    },
    socialProviders,
    plugins: [],
    // Hardening explícito em vez de depender apenas dos defaults da biblioteca
    // (que variam de comportamento conforme NODE_ENV — ver ADR sobre bypass de dev).
    session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 dias
        updateAge: 60 * 60 * 24, // renova a sessão a cada 24h de uso
    },
    advanced: {
        useSecureCookies: process.env.NODE_ENV === "production",
        defaultCookieAttributes: {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
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
                type: "string",
                defaultValue: "VISUALIZADOR",
                input: false
            },
            organizationId: {
                type: "string",
                required: false,
                input: false
            },
            // O próprio usuário PODE limpar essa flag (input: true, padrão) — é exatamente
            // o que a tela de troca de senha obrigatória faz depois de uma troca bem-sucedida.
            mustChangePassword: {
                type: "boolean",
                defaultValue: false
            }
        }
    },
    databaseHooks: {
        user: {
            create: {
                before: async (user) => {
                    if (!isAuthorizedLoginEmail(user.email)) {
                        throw new APIError("FORBIDDEN", {
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
                            data: { id: orgId, name: `${user.name || 'Novo Usuário'} - ${brandTitle}` }
                        });
                        return {
                            data: {
                                ...user,
                                organizationId: org.id
                            }
                        };
                    }
                    return { data: user };
                }
            },
            update: {
                before: async (user) => {
                    if (user.email && !isAuthorizedLoginEmail(user.email)) {
                        throw new APIError("FORBIDDEN", {
                            message: ACCESS_DENIED_MESSAGE,
                        });
                    }

                    return { data: user };
                }
            }
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
                        throw new APIError("FORBIDDEN", {
                            message: ACCESS_DENIED_MESSAGE,
                        });
                    }

                    // No session-count limit is applied: the authorized account may
                    // remain signed in on multiple browsers/devices simultaneously.
                    return { data: session };
                }
            }
        }
    }
});
