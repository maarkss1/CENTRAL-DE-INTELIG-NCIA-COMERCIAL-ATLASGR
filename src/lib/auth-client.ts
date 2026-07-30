import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    baseURL: (import.meta as any).env?.VITE_API_URL || (typeof window !== 'undefined' ? window.location.origin : "http://localhost:3000"),
});
