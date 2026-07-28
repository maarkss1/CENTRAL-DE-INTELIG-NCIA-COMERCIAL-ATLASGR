$c27 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : database/Database
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Facade
 * ----------------------------------------------------------------------------
 * @description Facade unifying connection, transaction and health operations for the CRM database.
 * @license Proprietary
 * ============================================================================
 */

import { PrismaConnection } from '../prisma/PrismaConnection';
import { PrismaTransaction } from '../prisma/PrismaTransaction';
import { PrismaHealthCheck } from '../prisma/PrismaHealthCheck';

/**
 * Facade exposing a simplified API over the Prisma-based persistence
 * subsystem (connection, transactions, and health checks).
 */
export class Database {
  private readonly connection = new PrismaConnection();
  private readonly transaction = new PrismaTransaction();
  private readonly health = new PrismaHealthCheck();

  public async connect(): Promise<void> {
    await this.connection.connect();
  }

  public async disconnect(): Promise<void> {
    await this.connection.disconnect();
  }

  public async withTransaction<T>(work: (tx: unknown) => Promise<T>): Promise<T> {
    return this.transaction.run(work as never);
  }

  public async isHealthy(): Promise<boolean> {
    const result = await this.health.check();
    return result.healthy;
  }
}

'@

$c28 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : database/DatabaseConnection
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description Low level connection state manager with retry/backoff.
 * @license Proprietary
 * ============================================================================
 */

export interface ConnectionOptions {
  maxRetries: number;
  retryDelayMs: number;
}

/**
 * Manages database connection attempts with exponential backoff retry logic.
 */
export class DatabaseConnection {
  private connected = false;

  public constructor(private readonly options: ConnectionOptions = { maxRetries: 5, retryDelayMs: 1000 }) {}

  public async connectWithRetry(connectFn: () => Promise<void>): Promise<void> {
    let attempt = 0;
    let delay = this.options.retryDelayMs;
    while (attempt < this.options.maxRetries) {
      try {
        await connectFn();
        this.connected = true;
        return;
      } catch (error) {
        attempt += 1;
        if (attempt >= this.options.maxRetries) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  }

  public isConnected(): boolean {
    return this.connected;
  }
}

'@

$c29 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : database/DatabaseTransaction
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Unit of Work
 * ----------------------------------------------------------------------------
 * @description Generic transaction boundary abstraction independent of ORM.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Generic abstraction representing a Unit of Work transaction boundary,
 * decoupled from the specific ORM implementation.
 */
export interface DatabaseTransaction {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export class NoopDatabaseTransaction implements DatabaseTransaction {
  public async begin(): Promise<void> {}
  public async commit(): Promise<void> {}
  public async rollback(): Promise<void> {}
}

'@

$c30 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : database/DatabaseInitializer
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Bootstrap
 * ----------------------------------------------------------------------------
 * @description Bootstraps schema validation and required extensions on startup.
 * @license Proprietary
 * ============================================================================
 */

import { prisma } from '../prisma/PrismaClient';

/**
 * Ensures the database is ready for use at application startup, validating
 * required PostgreSQL extensions (e.g. pgcrypto, uuid-ossp).
 */
export class DatabaseInitializer {
  public async initialize(): Promise<void> {
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  }
}

'@

$c31 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : database/DatabaseHealth
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Health Check
 * ----------------------------------------------------------------------------
 * @description Aggregates database health indicators for observability.
 * @license Proprietary
 * ============================================================================
 */

import { PrismaHealthCheck } from '../prisma/PrismaHealthCheck';

export interface DatabaseHealthReport {
  healthy: boolean;
  latencyMs: number;
  checkedAt: string;
}

/**
 * Produces a timestamped health report for the primary database connection.
 */
export class DatabaseHealth {
  private readonly checker = new PrismaHealthCheck();

  public async report(): Promise<DatabaseHealthReport> {
    const result = await this.checker.check();
    return { healthy: result.healthy, latencyMs: result.latencyMs, checkedAt: new Date().toISOString() };
  }
}

'@

$c32 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : database/DatabaseSeeder
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Seed
 * ----------------------------------------------------------------------------
 * @description Orchestrates execution of all registered seeders in order.
 * @license Proprietary
 * ============================================================================
 */

export interface Seeder {
  readonly name: string;
  run(): Promise<void>;
}

/**
 * Runs a collection of Seeder implementations sequentially, logging progress.
 */
export class DatabaseSeeder {
  private readonly seeders: Seeder[] = [];

  public register(seeder: Seeder): void {
    this.seeders.push(seeder);
  }

  public async runAll(): Promise<string[]> {
    const executed: string[] = [];
    for (const seeder of this.seeders) {
      await seeder.run();
      executed.push(seeder.name);
    }
    return executed;
  }
}

'@

$c33 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : database/DatabaseBackup
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Utility
 * ----------------------------------------------------------------------------
 * @description Produces logical backups of the CRM database using pg_dump.
 * @license Proprietary
 * ============================================================================
 */

import { spawn } from 'node:child_process';

export interface BackupOptions {
  connectionString: string;
  outputPath: string;
}

/**
 * Wraps the pg_dump command-line utility to generate consistent logical
 * backups of the PostgreSQL database.
 */
export class DatabaseBackup {
  public async run(options: BackupOptions): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('pg_dump', ['--dbname', options.connectionString, '--file', options.outputPath]);
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`pg_dump exited with code ${code}`));
        }
      });
    });
  }
}

'@

$c34 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : database/DatabaseRestore
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Utility
 * ----------------------------------------------------------------------------
 * @description Restores a logical backup using psql.
 * @license Proprietary
 * ============================================================================
 */

import { spawn } from 'node:child_process';

export interface RestoreOptions {
  connectionString: string;
  inputPath: string;
}

/**
 * Wraps the psql command-line utility to restore a previously generated
 * logical backup into the PostgreSQL database.
 */
export class DatabaseRestore {
  public async run(options: RestoreOptions): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('psql', [options.connectionString, '-f', options.inputPath]);
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`psql exited with code ${code}`));
        }
      });
    });
  }
}

'@

$c35 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : cache/CacheProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Strategy
 * ----------------------------------------------------------------------------
 * @description Defines the generic cache provider contract.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Generic contract implemented by any caching backend (memory, Redis, etc.).
 */
export interface CacheProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
}

'@

$c36 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : cache/RedisProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description Redis-backed implementation of CacheProvider.
 * @license Proprietary
 * ============================================================================
 */

import type Redis from 'ioredis';
import type { CacheProvider } from './CacheProvider';

/**
 * Implements CacheProvider using a Redis client, serializing values as JSON.
 */
export class RedisProvider implements CacheProvider {
  public constructor(private readonly client: Redis) {}

  public async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  public async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const payload = JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.set(key, payload, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, payload);
    }
  }

  public async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  public async has(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  public async clear(): Promise<void> {
    await this.client.flushdb();
  }
}

'@

$c37 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : cache/MemoryCache
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description In-process memory implementation of CacheProvider for local development.
 * @license Proprietary
 * ============================================================================
 */

import type { CacheProvider } from './CacheProvider';

interface Entry {
  value: unknown;
  expiresAt: number | null;
}

/**
 * Simple in-memory implementation of CacheProvider, suitable for tests
 * and local development environments without Redis.
 */
export class MemoryCache implements CacheProvider {
  private readonly store = new Map<string, Entry>();

  public async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  public async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  public async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  public async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  public async clear(): Promise<void> {
    this.store.clear();
  }
}

'@

$c38 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : cache/DistributedCache
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Decorator
 * ----------------------------------------------------------------------------
 * @description Composes a local L1 cache with a distributed L2 (Redis) cache.
 * @license Proprietary
 * ============================================================================
 */

import type { CacheProvider } from './CacheProvider';

/**
 * Two-tier cache combining a fast in-process cache (L1) with a shared
 * distributed cache (L2), reducing load on the distributed backend.
 */
export class DistributedCache implements CacheProvider {
  public constructor(
    private readonly l1: CacheProvider,
    private readonly l2: CacheProvider,
  ) {}

  public async get<T>(key: string): Promise<T | null> {
    const local = await this.l1.get<T>(key);
    if (local !== null) return local;
    const remote = await this.l2.get<T>(key);
    if (remote !== null) {
      await this.l1.set(key, remote);
    }
    return remote;
  }

  public async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await Promise.all([this.l1.set(key, value, ttlSeconds), this.l2.set(key, value, ttlSeconds)]);
  }

  public async delete(key: string): Promise<void> {
    await Promise.all([this.l1.delete(key), this.l2.delete(key)]);
  }

  public async has(key: string): Promise<boolean> {
    return (await this.l1.has(key)) || (await this.l2.has(key));
  }

  public async clear(): Promise<void> {
    await Promise.all([this.l1.clear(), this.l2.clear()]);
  }
}

'@

$c39 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : cache/CacheKey
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Value Object
 * ----------------------------------------------------------------------------
 * @description Builds normalized, collision-resistant cache keys.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Value object responsible for generating consistent, namespaced cache keys.
 */
export class CacheKey {
  public static build(namespace: string, ...parts: Array<string | number>): string {
    return [namespace, ...parts.map(String)].join(':');
  }
}

'@

$c40 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : cache/CachePolicy
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Policy
 * ----------------------------------------------------------------------------
 * @description Encapsulates TTL and eviction policy per entity type.
 * @license Proprietary
 * ============================================================================
 */

export interface CachePolicyRule {
  ttlSeconds: number;
  staleWhileRevalidateSeconds?: number;
}

/**
 * Central registry of caching policies applied per domain entity.
 */
export class CachePolicy {
  private static readonly rules: Record<string, CachePolicyRule> = {
    lead: { ttlSeconds: 300, staleWhileRevalidateSeconds: 60 },
    company: { ttlSeconds: 600 },
    opportunity: { ttlSeconds: 180 },
  };

  public static forEntity(entity: string): CachePolicyRule {
    return this.rules[entity] ?? { ttlSeconds: 120 };
  }
}

'@

$c41 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : cache/CacheManager
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Facade
 * ----------------------------------------------------------------------------
 * @description High level API combining provider selection and policy application.
 * @license Proprietary
 * ============================================================================
 */

import type { CacheProvider } from './CacheProvider';
import { CacheKey } from './CacheKey';
import { CachePolicy } from './CachePolicy';

/**
 * Facade that applies CachePolicy rules automatically when reading/writing
 * cache entries for a given domain entity.
 */
export class CacheManager {
  public constructor(private readonly provider: CacheProvider) {}

  public async remember<T>(entity: string, id: string, loader: () => Promise<T>): Promise<T> {
    const key = CacheKey.build(entity, id);
    const cached = await this.provider.get<T>(key);
    if (cached !== null) return cached;
    const value = await loader();
    const policy = CachePolicy.forEntity(entity);
    await this.provider.set(key, value, policy.ttlSeconds);
    return value;
  }

  public async invalidate(entity: string, id: string): Promise<void> {
    await this.provider.delete(CacheKey.build(entity, id));
  }
}

'@

$c42 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : cache/CacheMetrics
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Observability
 * ----------------------------------------------------------------------------
 * @description Tracks cache hit/miss ratios.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Collects cache hit/miss counters for observability dashboards.
 */
export class CacheMetrics {
  private hits = 0;
  private misses = 0;

  public recordHit(): void {
    this.hits += 1;
  }

  public recordMiss(): void {
    this.misses += 1;
  }

  public hitRatio(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : this.hits / total;
  }

  public snapshot(): { hits: number; misses: number; hitRatio: number } {
    return { hits: this.hits, misses: this.misses, hitRatio: this.hitRatio() };
  }
}

'@

$c43 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : redis/RedisClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Singleton
 * ----------------------------------------------------------------------------
 * @description Creates and exposes a singleton ioredis client instance.
 * @license Proprietary
 * ============================================================================
 */

import Redis from 'ioredis';

/**
 * Provides a single ioredis client instance configured from environment
 * variables, shared across cache, queue, and lock subsystems.
 */
export class RedisClientFactory {
  private static instance: Redis | undefined;

  public static getInstance(): Redis {
    if (!RedisClientFactory.instance) {
      RedisClientFactory.instance = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
        maxRetriesPerRequest: 3,
      });
    }
    return RedisClientFactory.instance;
  }
}

export const redisClient = RedisClientFactory.getInstance();

'@

$c44 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : redis/RedisConnection
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description Manages Redis connection lifecycle events.
 * @license Proprietary
 * ============================================================================
 */

import { redisClient } from './RedisClient';

/**
 * Wraps Redis connection lifecycle events with structured logging hooks.
 */
export class RedisConnection {
  public onReady(callback: () => void): void {
    redisClient.on('ready', callback);
  }

  public onError(callback: (error: Error) => void): void {
    redisClient.on('error', callback);
  }

  public async disconnect(): Promise<void> {
    await redisClient.quit();
  }
}

'@

$c45 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : redis/RedisLock
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Distributed Lock
 * ----------------------------------------------------------------------------
 * @description Implements a simple SET NX EX based distributed lock.
 * @license Proprietary
 * ============================================================================
 */

import { redisClient } from './RedisClient';

/**
 * Implements a distributed mutual-exclusion lock using Redis SET NX EX,
 * suitable for coordinating cross-instance critical sections.
 */
export class RedisLock {
  public async acquire(resource: string, ttlMs: number): Promise<string | null> {
    const token = Math.random().toString(36).slice(2);
    const result = await redisClient.set(`lock:${resource}`, token, 'PX', ttlMs, 'NX');
    return result === 'OK' ? token : null;
  }

  public async release(resource: string, token: string): Promise<boolean> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await redisClient.eval(script, 1, `lock:${resource}`, token);
    return result === 1;
  }
}

'@

$c46 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : redis/RedisPubSub
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Publisher/Subscriber
 * ----------------------------------------------------------------------------
 * @description Provides pub/sub messaging via dedicated Redis connections.
 * @license Proprietary
 * ============================================================================
 */

import Redis from 'ioredis';

type MessageHandler = (message: string) => void;

/**
 * Implements the publish/subscribe pattern over Redis, used for real-time
 * cross-process domain event broadcasting.
 */
export class RedisPubSub {
  private readonly publisher = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  private readonly subscriber = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

  public async publish(channel: string, message: string): Promise<void> {
    await this.publisher.publish(channel, message);
  }

  public async subscribe(channel: string, handler: MessageHandler): Promise<void> {
    await this.subscriber.subscribe(channel);
    this.subscriber.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        handler(message);
      }
    });
  }
}

'@

$c47 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : redis/RedisStream
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Event Stream
 * ----------------------------------------------------------------------------
 * @description Wraps Redis Streams (XADD/XREAD) for durable event logs.
 * @license Proprietary
 * ============================================================================
 */

import { redisClient } from './RedisClient';

/**
 * Provides durable, append-only event streaming via Redis Streams,
 * used as a lightweight alternative to Kafka for domain event logs.
 */
export class RedisStream {
  public async append(stream: string, fields: Record<string, string>): Promise<string> {
    const flatFields = Object.entries(fields).flat();
    return redisClient.xadd(stream, '*', ...flatFields) as Promise<string>;
  }

  public async readLatest(stream: string, count: number): Promise<unknown> {
    return redisClient.xrevrange(stream, '+', '-', 'COUNT', count);
  }
}

'@

$c48 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : redis/RedisHealthCheck
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Health Check
 * ----------------------------------------------------------------------------
 * @description Pings Redis to verify availability and latency.
 * @license Proprietary
 * ============================================================================
 */

import { redisClient } from './RedisClient';

export interface RedisHealthResult {
  healthy: boolean;
  latencyMs: number;
}

/**
 * Executes a PING command against Redis to validate availability and
 * measure round-trip latency.
 */
export class RedisHealthCheck {
  public async check(): Promise<RedisHealthResult> {
    const start = Date.now();
    try {
      await redisClient.ping();
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }
}

'@

$c49 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : queues/QueueProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Strategy
 * ----------------------------------------------------------------------------
 * @description Defines the generic contract implemented by queue backends.
 * @license Proprietary
 * ============================================================================
 */

export interface QueueJob<T> {
  name: string;
  data: T;
}

/**
 * Generic contract implemented by any background job queue backend.
 */
export interface QueueProvider {
  enqueue<T>(queueName: string, job: QueueJob<T>): Promise<string>;
  process<T>(queueName: string, handler: (job: QueueJob<T>) => Promise<void>): void;
}

'@

$c50 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : queues/BullMQProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description BullMQ implementation of QueueProvider using Redis as broker.
 * @license Proprietary
 * ============================================================================
 */

import { Queue, Worker, type Job } from 'bullmq';
import type { QueueProvider, QueueJob } from './QueueProvider';

/**
 * Implements QueueProvider using BullMQ, backed by Redis, providing
 * reliable job persistence, retries, and horizontal worker scaling.
 */
export class BullMQProvider implements QueueProvider {
  private readonly queues = new Map<string, Queue>();
  private readonly connection = { connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' } };

  private getQueue(name: string): Queue {
    if (!this.queues.has(name)) {
      this.queues.set(name, new Queue(name, this.connection));
    }
    return this.queues.get(name) as Queue;
  }

  public async enqueue<T>(queueName: string, job: QueueJob<T>): Promise<string> {
    const queue = this.getQueue(queueName);
    const added = await queue.add(job.name, job.data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
    return added.id ?? '';
  }

  public process<T>(queueName: string, handler: (job: QueueJob<T>) => Promise<void>): void {
    new Worker(
      queueName,
      async (job: Job) => {
        await handler({ name: job.name, data: job.data as T });
      },
      this.connection,
    );
  }
}

'@

$c51 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : queues/QueueManager
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Facade
 * ----------------------------------------------------------------------------
 * @description Central registry coordinating multiple named queues.
 * @license Proprietary
 * ============================================================================
 */

import type { QueueProvider, QueueJob } from './QueueProvider';

/**
 * Provides a single entry point for enqueueing and processing jobs across
 * all CRM background queues (email, sms, webhooks, imports, etc.).
 */
export class QueueManager {
  public constructor(private readonly provider: QueueProvider) {}

  public async dispatch<T>(queueName: string, job: QueueJob<T>): Promise<string> {
    return this.provider.enqueue(queueName, job);
  }

  public register<T>(queueName: string, handler: (job: QueueJob<T>) => Promise<void>): void {
    this.provider.process(queueName, handler);
  }
}

'@

$c52 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : queues/QueueWorker
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Worker
 * ----------------------------------------------------------------------------
 * @description Base class for implementing typed queue workers.
 * @license Proprietary
 * ============================================================================
 */

import type { QueueJob } from './QueueProvider';

/**
 * Abstract base class encapsulating common worker lifecycle logic
 * (error handling, logging hooks) for concrete queue workers.
 */
export abstract class QueueWorker<T> {
  public abstract readonly queueName: string;

  public abstract handle(job: QueueJob<T>): Promise<void>;

  public async execute(job: QueueJob<T>): Promise<void> {
    try {
      await this.handle(job);
    } catch (error) {
      throw new Error(`Worker ${this.queueName} failed: ${(error as Error).message}`);
    }
  }
}

'@

$c53 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : queues/QueueConsumer
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Consumer
 * ----------------------------------------------------------------------------
 * @description Generic consumer wiring a handler function to a queue.
 * @license Proprietary
 * ============================================================================
 */

import type { QueueProvider } from './QueueProvider';

/**
 * Binds a business logic handler function to a specific named queue,
 * abstracting away the underlying queue provider details.
 */
export class QueueConsumer<T> {
  public constructor(
    private readonly provider: QueueProvider,
    private readonly queueName: string,
  ) {}

  public consume(handler: (data: T) => Promise<void>): void {
    this.provider.process<T>(this.queueName, async (job) => {
      await handler(job.data);
    });
  }
}

'@

$c54 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : queues/QueueProducer
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Producer
 * ----------------------------------------------------------------------------
 * @description Generic producer publishing typed jobs to a named queue.
 * @license Proprietary
 * ============================================================================
 */

import type { QueueProvider } from './QueueProvider';

/**
 * Publishes typed jobs to a specific named queue via the configured
 * QueueProvider implementation.
 */
export class QueueProducer<T> {
  public constructor(
    private readonly provider: QueueProvider,
    private readonly queueName: string,
  ) {}

  public async publish(name: string, data: T): Promise<string> {
    return this.provider.enqueue(this.queueName, { name, data });
  }
}

'@

$c55 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : queues/DeadLetterQueue
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Dead Letter Queue
 * ----------------------------------------------------------------------------
 * @description Captures jobs that exhausted retry attempts for manual review.
 * @license Proprietary
 * ============================================================================
 */

export interface FailedJob<T> {
  queueName: string;
  data: T;
  error: string;
  failedAt: string;
}

/**
 * Stores jobs that exhausted their retry attempts, enabling manual
 * inspection, alerting, and reprocessing workflows.
 */
export class DeadLetterQueue<T> {
  private readonly items: Array<FailedJob<T>> = [];

  public capture(queueName: string, data: T, error: string): void {
    this.items.push({ queueName, data, error, failedAt: new Date().toISOString() });
  }

  public list(): Array<FailedJob<T>> {
    return [...this.items];
  }

  public clear(): void {
    this.items.length = 0;
  }
}

'@

$c56 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : queues/RetryPolicy
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Policy
 * ----------------------------------------------------------------------------
 * @description Defines exponential backoff retry policies for queue jobs.
 * @license Proprietary
 * ============================================================================
 */

export interface RetryPolicyConfig {
  maxAttempts: number;
  baseDelayMs: number;
}

/**
 * Computes exponential backoff delays for retrying failed queue jobs.
 */
export class RetryPolicy {
  public constructor(private readonly config: RetryPolicyConfig = { maxAttempts: 5, baseDelayMs: 1000 }) {}

  public delayForAttempt(attempt: number): number {
    return this.config.baseDelayMs * Math.pow(2, attempt - 1);
  }

  public shouldRetry(attempt: number): boolean {
    return attempt < this.config.maxAttempts;
  }
}

'@

$c57 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : queues/QueueMetrics
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Observability
 * ----------------------------------------------------------------------------
 * @description Tracks queue throughput and failure counters.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Collects queue processing metrics (processed, failed, throughput)
 * for observability dashboards and alerting.
 */
export class QueueMetrics {
  private processed = 0;
  private failed = 0;

  public recordProcessed(): void {
    this.processed += 1;
  }

  public recordFailed(): void {
    this.failed += 1;
  }

  public snapshot(): { processed: number; failed: number } {
    return { processed: this.processed, failed: this.failed };
  }
}

'@

$c58 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : storage/StorageProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Strategy
 * ----------------------------------------------------------------------------
 * @description Generic contract for file storage backends.
 * @license Proprietary
 * ============================================================================
 */

export interface UploadResult {
  key: string;
  url: string;
  sizeBytes: number;
}

/**
 * Generic contract implemented by any binary object storage backend
 * (local disk, S3, MinIO).
 */
export interface StorageProvider {
  upload(key: string, content: Buffer, contentType: string): Promise<UploadResult>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getUrl(key: string): Promise<string>;
  exists(key: string): Promise<boolean>;
}

'@

$c59 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : storage/LocalStorage
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description Local filesystem implementation of StorageProvider.
 * @license Proprietary
 * ============================================================================
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { StorageProvider, UploadResult } from './StorageProvider';

/**
 * Implements StorageProvider using the local filesystem, intended for
 * development environments without an object storage service.
 */
export class LocalStorage implements StorageProvider {
  public constructor(private readonly basePath: string) {}

  public async upload(key: string, content: Buffer, _contentType: string): Promise<UploadResult> {
    const fullPath = path.join(this.basePath, key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
    return { key, url: fullPath, sizeBytes: content.byteLength };
  }

  public async download(key: string): Promise<Buffer> {
    return fs.readFile(path.join(this.basePath, key));
  }

  public async delete(key: string): Promise<void> {
    await fs.unlink(path.join(this.basePath, key));
  }

  public async getUrl(key: string): Promise<string> {
    return path.join(this.basePath, key);
  }

  public async exists(key: string): Promise<boolean> {
    try {
      await fs.access(path.join(this.basePath, key));
      return true;
    } catch {
      return false;
    }
  }
}

'@

$c60 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : storage/S3Storage
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description AWS S3 implementation of StorageProvider using the AWS SDK v3.
 * @license Proprietary
 * ============================================================================
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@ aws-sdk/client-s3';
import { getSignedUrl } from '@ aws-sdk/s3-request-presigner';
import type { StorageProvider, UploadResult } from './StorageProvider';

/**
 * Implements StorageProvider using AWS S3 as the persistent object store
 * for CRM attachments, proposals, and generated documents.
 */
export class S3Storage implements StorageProvider {
  private readonly client: S3Client;

  public constructor(private readonly bucket: string, region: string) {
    this.client = new S3Client({ region });
  }

  public async upload(key: string, content: Buffer, contentType: string): Promise<UploadResult> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: content, ContentType: contentType }),
    );
    return { key, url: await this.getUrl(key), sizeBytes: content.byteLength };
  }

  public async download(key: string): Promise<Buffer> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  public async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  public async getUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: 3600 });
  }

  public async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}

'@

$c61 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : storage/MinIOStorage
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description MinIO implementation of StorageProvider, S3-compatible for self-hosting.
 * @license Proprietary
 * ============================================================================
 */

import { Client } from 'minio';
import type { StorageProvider, UploadResult } from './StorageProvider';

/**
 * Implements StorageProvider using MinIO, an S3-compatible self-hosted
 * object storage engine, suited for on-premise deployments.
 */
export class MinIOStorage implements StorageProvider {
  private readonly client: Client;

  public constructor(
    private readonly bucket: string,
    options: { endPoint: string; port: number; useSSL: boolean; accessKey: string; secretKey: string },
  ) {
    this.client = new Client(options);
  }

  public async upload(key: string, content: Buffer, contentType: string): Promise<UploadResult> {
    await this.client.putObject(this.bucket, key, content, content.byteLength, { 'Content-Type': contentType });
    return { key, url: await this.getUrl(key), sizeBytes: content.byteLength };
  }

  public async download(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  }

  public async delete(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }

  public async getUrl(key: string): Promise<string> {
    return this.client.presignedGetObject(this.bucket, key, 3600);
  }

  public async exists(key: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, key);
      return true;
    } catch {
      return false;
    }
  }
}

'@

$c62 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : storage/FileManager
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Facade
 * ----------------------------------------------------------------------------
 * @description High level API combining upload, download and validation.
 * @license Proprietary
 * ============================================================================
 */

import type { StorageProvider, UploadResult } from './StorageProvider';
import { FileValidator } from './FileValidator';

/**
 * Coordinates validation, storage provider delegation, and metadata
 * assembly for CRM file attachments.
 */
export class FileManager {
  private readonly validator = new FileValidator();

  public constructor(private readonly provider: StorageProvider) {}

  public async save(key: string, content: Buffer, contentType: string): Promise<UploadResult> {
    this.validator.validate(content, contentType);
    return this.provider.upload(key, content, contentType);
  }

  public async retrieve(key: string): Promise<Buffer> {
    return this.provider.download(key);
  }

  public async remove(key: string): Promise<void> {
    await this.provider.delete(key);
  }
}

'@

$c63 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : storage/FileUploader
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Service
 * ----------------------------------------------------------------------------
 * @description Handles chunked/multi-part style upload orchestration.
 * @license Proprietary
 * ============================================================================
 */

import type { StorageProvider, UploadResult } from './StorageProvider';

/**
 * Orchestrates file upload operations, including key generation based
 * on entity context (module/entity/id/filename).
 */
export class FileUploader {
  public constructor(private readonly provider: StorageProvider) {}

  public async uploadForEntity(
    entity: string,
    entityId: string,
    filename: string,
    content: Buffer,
    contentType: string,
  ): Promise<UploadResult> {
    const key = `${entity}/${entityId}/${Date.now()}-${filename}`;
    return this.provider.upload(key, content, contentType);
  }
}

'@

$c64 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : storage/FileDownloader
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Service
 * ----------------------------------------------------------------------------
 * @description Retrieves stored files and resolves temporary access URLs.
 * @license Proprietary
 * ============================================================================
 */

import type { StorageProvider } from './StorageProvider';

/**
 * Retrieves file content and generates temporary access URLs for
 * client-facing download links.
 */
export class FileDownloader {
  public constructor(private readonly provider: StorageProvider) {}

  public async getContent(key: string): Promise<Buffer> {
    return this.provider.download(key);
  }

  public async getTemporaryUrl(key: string): Promise<string> {
    return this.provider.getUrl(key);
  }
}

'@

$c65 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : storage/FileValidator
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Validator
 * ----------------------------------------------------------------------------
 * @description Validates file size and MIME type before storage operations.
 * @license Proprietary
 * ============================================================================
 */

const MAX_SIZE_BYTES = 25 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
]);

/**
 * Validates uploaded file content against size limits and an allow-list
 * of accepted MIME types before persisting to a StorageProvider.
 */
export class FileValidator {
  public validate(content: Buffer, contentType: string): void {
    if (content.byteLength > MAX_SIZE_BYTES) {
      throw new Error(`File exceeds maximum allowed size of ${MAX_SIZE_BYTES} bytes`);
    }
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new Error(`Content type ${contentType} is not allowed`);
    }
  }
}

'@

$c66 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : email/EmailProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Strategy
 * ----------------------------------------------------------------------------
 * @description Generic contract implemented by email sending backends.
 * @license Proprietary
 * ============================================================================
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

/**
 * Generic contract implemented by any transactional email sending backend.
 */
export interface EmailProvider {
  send(message: EmailMessage): Promise<string>;
}

'@

$c67 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : email/SMTPProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description SMTP implementation of EmailProvider using Nodemailer.
 * @license Proprietary
 * ============================================================================
 */

import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailProvider, EmailMessage } from './EmailProvider';

/**
 * Implements EmailProvider using an SMTP transport via Nodemailer,
 * suitable for self-hosted or corporate mail relays.
 */
export class SMTPProvider implements EmailProvider {
  private readonly transporter: Transporter;

  public constructor(config: { host: string; port: number; user: string; pass: string }) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      auth: { user: config.user, pass: config.pass },
    });
  }

  public async send(message: EmailMessage): Promise<string> {
    const info = await this.transporter.sendMail({
      from: message.from ?? 'no-reply@prospector-atlas.com',
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
    return info.messageId;
  }
}

'@

$c68 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : email/ResendProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description Resend.com API implementation of EmailProvider.
 * @license Proprietary
 * ============================================================================
 */

import type { EmailProvider, EmailMessage } from './EmailProvider';

/**
 * Implements EmailProvider using the Resend HTTP API, a modern
 * developer-focused transactional email service.
 */
export class ResendProvider implements EmailProvider {
  public constructor(private readonly apiKey: string) {}

  public async send(message: EmailMessage): Promise<string> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: message.from ?? 'no-reply@prospector-atlas.com',
        to: message.to,
        subject: message.subject,
        html: message.html,
      }),
    });
    const data = (await response.json()) as { id: string };
    return data.id;
  }
}

'@

$c69 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : email/EmailTemplateEngine
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Service
 * ----------------------------------------------------------------------------
 * @description Renders HTML email templates with variable interpolation.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Renders email HTML templates by interpolating {{variable}} placeholders
 * with provided context data.
 */
export class EmailTemplateEngine {
  public render(template: string, context: Record<string, string>): string {
    return template.replace(/{{\s*(\w+)\s*}}/g, (_match, key: string) => context[key] ?? '');
  }
}

'@

$c70 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : email/EmailQueue
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Producer
 * ----------------------------------------------------------------------------
 * @description Queues outbound emails for asynchronous delivery via BullMQ.
 * @license Proprietary
 * ============================================================================
 */

import type { QueueProvider } from '../queues/QueueProvider';
import type { EmailMessage } from './EmailProvider';

/**
 * Publishes outbound email messages to the 'emails' background queue,
 * decoupling request handling from delivery latency.
 */
export class EmailQueue {
  public constructor(private readonly queueProvider: QueueProvider) {}

  public async enqueue(message: EmailMessage): Promise<string> {
    return this.queueProvider.enqueue('emails', { name: 'send-email', data: message });
  }
}

'@

$c71 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : email/EmailSender
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Facade
 * ----------------------------------------------------------------------------
 * @description High level API combining template rendering and provider dispatch.
 * @license Proprietary
 * ============================================================================
 */

import type { EmailProvider, EmailMessage } from './EmailProvider';
import { EmailTemplateEngine } from './EmailTemplateEngine';

/**
 * Coordinates template rendering and delegation to the configured
 * EmailProvider implementation for outbound transactional emails.
 */
export class EmailSender {
  private readonly templateEngine = new EmailTemplateEngine();

  public constructor(private readonly provider: EmailProvider) {}

  public async sendTemplated(
    to: string,
    subject: string,
    template: string,
    context: Record<string, string>,
  ): Promise<string> {
    const html = this.templateEngine.render(template, context);
    return this.provider.send({ to, subject, html } satisfies EmailMessage);
  }
}

'@

$c72 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : sms/SmsProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Strategy
 * ----------------------------------------------------------------------------
 * @description Generic contract implemented by SMS sending backends.
 * @license Proprietary
 * ============================================================================
 */

export interface SmsMessage {
  to: string;
  body: string;
}

/**
 * Generic contract implemented by any SMS delivery backend.
 */
export interface SmsProvider {
  send(message: SmsMessage): Promise<string>;
}

'@

$c73 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : sms/TwilioProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description Twilio implementation of SmsProvider.
 * @license Proprietary
 * ============================================================================
 */

import twilio from 'twilio';
import type { SmsProvider, SmsMessage } from './SmsProvider';

/**
 * Implements SmsProvider using the Twilio REST API for reliable
 * global SMS delivery.
 */
export class TwilioProvider implements SmsProvider {
  private readonly client: ReturnType<typeof twilio>;

  public constructor(
    accountSid: string,
    authToken: string,
    private readonly fromNumber: string,
  ) {
    this.client = twilio(accountSid, authToken);
  }

  public async send(message: SmsMessage): Promise<string> {
    const result = await this.client.messages.create({
      to: message.to,
      from: this.fromNumber,
      body: message.body,
    });
    return result.sid;
  }
}

'@

$c74 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : sms/SmsSender
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Facade
 * ----------------------------------------------------------------------------
 * @description High level API delegating to the configured SmsProvider.
 * @license Proprietary
 * ============================================================================
 */

import type { SmsProvider, SmsMessage } from './SmsProvider';

/**
 * Provides a simple facade for dispatching SMS notifications through
 * the configured SmsProvider implementation.
 */
export class SmsSender {
  public constructor(private readonly provider: SmsProvider) {}

  public async send(to: string, body: string): Promise<string> {
    return this.provider.send({ to, body } satisfies SmsMessage);
  }
}

'@

$c75 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : whatsapp/WhatsAppProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Strategy
 * ----------------------------------------------------------------------------
 * @description Generic contract implemented by WhatsApp messaging backends.
 * @license Proprietary
 * ============================================================================
 */

export interface WhatsAppMessage {
  to: string;
  text: string;
}

/**
 * Generic contract implemented by any WhatsApp Business messaging backend.
 */
export interface WhatsAppProvider {
  send(message: WhatsAppMessage): Promise<string>;
}

'@

$c76 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : whatsapp/EvolutionAPIProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description Evolution API implementation of WhatsAppProvider.
 * @license Proprietary
 * ============================================================================
 */

import type { WhatsAppProvider, WhatsAppMessage } from './WhatsAppProvider';

/**
 * Implements WhatsAppProvider using the self-hosted Evolution API,
 * a popular open-source WhatsApp Business gateway.
 */
export class EvolutionAPIProvider implements WhatsAppProvider {
  public constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly instanceName: string,
  ) {}

  public async send(message: WhatsAppMessage): Promise<string> {
    const response = await fetch(`${this.baseUrl}/message/sendText/${this.instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: this.apiKey },
      body: JSON.stringify({ number: message.to, text: message.text }),
    });
    const data = (await response.json()) as { key: { id: string } };
    return data.key.id;
  }
}

'@

$c77 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : whatsapp/WhatsAppSender
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Facade
 * ----------------------------------------------------------------------------
 * @description High level API delegating to the configured WhatsAppProvider.
 * @license Proprietary
 * ============================================================================
 */

import type { WhatsAppProvider, WhatsAppMessage } from './WhatsAppProvider';

/**
 * Provides a simple facade for dispatching WhatsApp notifications through
 * the configured WhatsAppProvider implementation.
 */
export class WhatsAppSender {
  public constructor(private readonly provider: WhatsAppProvider) {}

  public async send(to: string, text: string): Promise<string> {
    return this.provider.send({ to, text } satisfies WhatsAppMessage);
  }
}

'@
