export interface UsagePoint {
  day: string;
  tokens: number;
  cost: number;
  calls: number;
}

export interface UsageByModel {
  model: string;
  tokens: number;
  cost: number;
  calls: number;
  avgLatencyMs: number;
}

/**
 * `AILog.promptId` (ex.: 'meeting-synthesis', 'churn-prediction-analysis') já é gravado em toda
 * chamada real de IA (ver `src/lib/ai/gateway/prompt-registry.ts`), mas a tela de consumo nunca
 * quebrava o custo por essa dimensão — só por `model`, escondendo qual FUNCIONALIDADE do produto
 * gastou o quê (achado do Piloto 022).
 */
export interface UsageByPrompt {
  promptId: string;
  tokens: number;
  cost: number;
  calls: number;
}

export interface UsageSummary {
  totalTokens: number;
  totalCost: number;
  totalCalls: number;
  avgLatencyMs: number;
  /** Custo do mês corrente, para comparação com o período todo. */
  costThisMonth: number;
  byModel: UsageByModel[];
  byPrompt: UsageByPrompt[];
  daily: UsagePoint[];
  /** Chamadas gravadas antes da coluna de tenant existir, ou feitas fora de requisição. */
  unattributedCalls: number;
  isEmpty: boolean;
}

export interface UsageLogRow {
  createdAt: Date;
  tokens: number;
  cost: number;
  latencyMs: number;
}

export interface UsageByModelRow {
  model: string;
  tokens: number;
  cost: number;
  calls: number;
  avgLatencyMs: number;
}

export interface UsageByPromptRow {
  promptId: string | null;
  tokens: number;
  cost: number;
  calls: number;
}

/**
 * Consumo de IA por organização não é uma entidade CRUD — é leitura agregada sobre `AILog`
 * (mesmo raciocínio de `AnalyticsRepository`: cada método espelha uma consulta agregada
 * específica, não um CRUD genérico).
 */
export interface UsageRepository {
  findLogsSince(organizationId: string, since: Date): Promise<UsageLogRow[]>;
  groupByModel(organizationId: string, since: Date): Promise<UsageByModelRow[]>;
  groupByPrompt(organizationId: string, since: Date): Promise<UsageByPromptRow[]>;
  sumCostSince(organizationId: string, since: Date): Promise<number>;
  /** Chamadas gravadas antes da coluna de tenant existir, ou feitas fora de requisição
   *  (`organizationId: null`). */
  countUnattributed(since: Date): Promise<number>;
}
