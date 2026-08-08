import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "./auth.js";

export const authClient = createAuthClient({
    baseURL: import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? window.location.origin : "http://localhost:3000"),
    // Tipa authClient.updateUser/session com os additionalFields definidos no servidor (auth.ts) —
    // import type-only: nunca inclui o módulo do servidor (prismaAdapter, segredo) no bundle do cliente.
    plugins: [inferAdditionalFields<typeof auth>()],
});
