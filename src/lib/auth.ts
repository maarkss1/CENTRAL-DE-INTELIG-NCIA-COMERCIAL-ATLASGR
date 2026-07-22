import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { twoFactor } from "better-auth/plugins";
import { prisma } from "./prisma.js";

export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    emailAndPassword: {
        enabled: true,
        autoSignIn: true,
    },
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID || "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        },
        microsoft: {
            clientId: process.env.MICROSOFT_CLIENT_ID || "",
            clientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
        }
    },
    plugins: [
        twoFactor()
    ],
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
            }
        }
    }
});
