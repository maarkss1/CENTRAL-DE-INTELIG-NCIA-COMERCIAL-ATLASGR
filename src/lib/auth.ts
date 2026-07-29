import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { prisma } from "./prisma.js";
import { parseAllowedOrigins } from "../config/network.js";
import { isAuthorizedLoginEmail } from "../config/access-policy.js";

const ACCESS_DENIED_MESSAGE = "Acesso restrito ao e-mail autorizado.";

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
    trustedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
    emailAndPassword: {
        enabled: false,
    },
    socialProviders,
    plugins: [],
    user: {
        additionalFields: {
            role: {
                type: "string",
                defaultValue: "VISUALIZADOR"
            },
            organizationId: {
                type: "string",
                required: false,
                input: false
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

                    // Create an organization if one isn't provided (during registration)
                    if (!user.organizationId) {
                        const org = await prisma.organization.create({
                            data: { name: `${user.name || 'New'}'s Organization` }
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

                    if (!isAuthorizedLoginEmail(user?.email)) {
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
