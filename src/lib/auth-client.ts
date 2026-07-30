import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
    baseURL: (import.meta as unknown).env?.VITE_API_URL || (typeof window !== 'undefined' ? window.location.origin : "http://localhost:3000"),
});
