import { Langfuse } from 'langfuse';

let client: Langfuse | undefined;

export function getLangfuseClient(): Langfuse | undefined {
    if (client) return client;
    if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) return undefined;

    client = new Langfuse({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        baseUrl: process.env.LANGFUSE_BASEURL ?? 'http://localhost:3001',
    });
    return client;
}

export async function shutdownLangfuse(): Promise<void> {
    await client?.shutdownAsync();
    client = undefined;
}
