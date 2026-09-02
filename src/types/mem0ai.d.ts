declare module 'mem0ai' {
  export class MemoryClient {
    constructor(config: { apiKey: string });
    add(messages: unknown[], options?: Record<string, unknown>): Promise<void>;
    search(query: string, options?: Record<string, unknown>): Promise<unknown[]>;
    delete_all(options?: Record<string, unknown>): Promise<void>;
  }

  export class Memory {
    constructor(config: Record<string, unknown>);
    add(messages: unknown[], options?: Record<string, unknown>): Promise<void>;
    search(query: string, options?: Record<string, unknown>): Promise<unknown[]>;
    delete_all(options?: Record<string, unknown>): Promise<void>;
  }
}
