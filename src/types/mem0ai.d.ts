declare module 'mem0ai' {
  export class MemoryClient {
    constructor(config: { apiKey: string });
    add(messages: any[], options: any): Promise<void>;
    search(query: string, options: any): Promise<any[]>;
    delete_all(options: any): Promise<void>;
  }

  export class Memory {
    constructor(config: any);
    add(messages: any[], options: any): Promise<void>;
    search(query: string, options: any): Promise<any[]>;
    delete_all(options: any): Promise<void>;
  }
}
