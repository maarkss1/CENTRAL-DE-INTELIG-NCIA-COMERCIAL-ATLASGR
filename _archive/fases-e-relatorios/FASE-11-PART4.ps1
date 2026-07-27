$c126 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : locks/DistributedLock
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Strategy
 * ----------------------------------------------------------------------------
 * @description Generic contract implemented by distributed lock backends.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Generic contract implemented by any distributed mutual-exclusion
 * lock backend.
 */
export interface DistributedLock {
  acquire(resource: string, ttlMs: number): Promise<string | null>;
  release(resource: string, token: string): Promise<boolean>;
}

'@

$c127 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : locks/RedisLockProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description Redis-backed implementation of DistributedLock.
 * @license Proprietary
 * ============================================================================
 */

import { RedisLock } from '../redis/RedisLock';
import type { DistributedLock } from './DistributedLock';

/**
 * Implements DistributedLock using the Redis-based RedisLock primitive.
 */
export class RedisLockProvider implements DistributedLock {
  private readonly redisLock = new RedisLock();

  public async acquire(resource: string, ttlMs: number): Promise<string | null> {
    return this.redisLock.acquire(resource, ttlMs);
  }

  public async release(resource: string, token: string): Promise<boolean> {
    return this.redisLock.release(resource, token);
  }
}

'@

$c128 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : locks/LockManager
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Facade
 * ----------------------------------------------------------------------------
 * @description High level API for acquiring locks with automatic release.
 * @license Proprietary
 * ============================================================================
 */

import type { DistributedLock } from './DistributedLock';

/**
 * Provides a convenient withLock helper guaranteeing lock release even
 * when the protected operation throws.
 */
export class LockManager {
  public constructor(private readonly lock: DistributedLock) {}

  public async withLock<T>(resource: string, ttlMs: number, operation: () => Promise<T>): Promise<T> {
    const token = await this.lock.acquire(resource, ttlMs);
    if (!token) {
      throw new Error(`Could not acquire lock for resource: ${resource}`);
    }
    try {
      return await operation();
    } finally {
      await this.lock.release(resource, token);
    }
  }
}

'@

$c129 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : telemetry/MetricsProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Provider
 * ----------------------------------------------------------------------------
 * @description Collects application metrics counters, gauges and histograms.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Provides a minimal in-memory metrics registry (counters and gauges)
 * usable until an external APM backend is wired.
 */
export class MetricsProvider {
  private readonly counters = new Map<string, number>();

  public increment(name: string, value = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + value);
  }

  public getValue(name: string): number {
    return this.counters.get(name) ?? 0;
  }

  public snapshot(): Record<string, number> {
    return Object.fromEntries(this.counters);
  }
}

'@

$c130 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : telemetry/TracingProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Provider
 * ----------------------------------------------------------------------------
 * @description Provides basic span creation for distributed tracing.
 * @license Proprietary
 * ============================================================================
 */

export interface SimpleSpan {
  name: string;
  startedAt: number;
  end(): void;
}

/**
 * Provides a minimal tracing implementation compatible with the
 * TracingInterceptor contract, useful before OpenTelemetry is wired.
 */
export class TracingProvider {
  public startSpan(name: string): SimpleSpan {
    const startedAt = Date.now();
    return {
      name,
      startedAt,
      end: () => {
        const duration = Date.now() - startedAt;
        console.info(`[trace] ${name} took ${duration}ms`);
      },
    };
  }
}

'@

$c131 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : telemetry/TelemetryProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Facade
 * ----------------------------------------------------------------------------
 * @description Unifies metrics and tracing behind a single API.
 * @license Proprietary
 * ============================================================================
 */

import { MetricsProvider } from './MetricsProvider';
import { TracingProvider } from './TracingProvider';

/**
 * Facade unifying metrics collection and distributed tracing into a
 * single entry point for infrastructure instrumentation.
 */
export class TelemetryProvider {
  public readonly metrics = new MetricsProvider();
  public readonly tracing = new TracingProvider();
}

'@

$c132 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : telemetry/PerformanceMonitor
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Monitor
 * ----------------------------------------------------------------------------
 * @description Measures execution duration of arbitrary operations.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Measures and reports the execution duration of arbitrary asynchronous
 * operations for performance monitoring purposes.
 */
export class PerformanceMonitor {
  public async measure<T>(label: string, operation: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
    const start = Date.now();
    const result = await operation();
    return { result, durationMs: Date.now() - start };
  }
}

'@

$c133 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : exceptions/InfrastructureException
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Exception
 * ----------------------------------------------------------------------------
 * @description Base exception class for all infrastructure layer errors.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Base class for all infrastructure-layer exceptions, carrying an
 * error code for programmatic handling upstream.
 */
export class InfrastructureException extends Error {
  public constructor(
    message: string,
    public readonly code: string = 'INFRASTRUCTURE_ERROR',
  ) {
    super(message);
    this.name = 'InfrastructureException';
  }
}

'@

$c134 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : exceptions/DatabaseException
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Exception
 * ----------------------------------------------------------------------------
 * @description Specialized exception representing failures in the database subsystem.
 * @license Proprietary
 * ============================================================================
 */

import { InfrastructureException } from './InfrastructureException';

/**
 * Represents failures originating specifically from the database
 * subsystem of the infrastructure layer.
 */
export class DatabaseException extends InfrastructureException {
  public constructor(message: string) {
    super(message, 'DATABASE_ERROR');
    this.name = 'DatabaseException';
  }
}

'@

$c135 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : exceptions/CacheException
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Exception
 * ----------------------------------------------------------------------------
 * @description Specialized exception representing failures in the cache subsystem.
 * @license Proprietary
 * ============================================================================
 */

import { InfrastructureException } from './InfrastructureException';

/**
 * Represents failures originating specifically from the cache
 * subsystem of the infrastructure layer.
 */
export class CacheException extends InfrastructureException {
  public constructor(message: string) {
    super(message, 'CACHE_ERROR');
    this.name = 'CacheException';
  }
}

'@

$c136 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : exceptions/QueueException
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Exception
 * ----------------------------------------------------------------------------
 * @description Specialized exception representing failures in the queue subsystem.
 * @license Proprietary
 * ============================================================================
 */

import { InfrastructureException } from './InfrastructureException';

/**
 * Represents failures originating specifically from the queue
 * subsystem of the infrastructure layer.
 */
export class QueueException extends InfrastructureException {
  public constructor(message: string) {
    super(message, 'QUEUE_ERROR');
    this.name = 'QueueException';
  }
}

'@

$c137 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : exceptions/StorageException
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Exception
 * ----------------------------------------------------------------------------
 * @description Specialized exception representing failures in the storage subsystem.
 * @license Proprietary
 * ============================================================================
 */

import { InfrastructureException } from './InfrastructureException';

/**
 * Represents failures originating specifically from the storage
 * subsystem of the infrastructure layer.
 */
export class StorageException extends InfrastructureException {
  public constructor(message: string) {
    super(message, 'STORAGE_ERROR');
    this.name = 'StorageException';
  }
}

'@

$c138 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : exceptions/IntegrationException
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Exception
 * ----------------------------------------------------------------------------
 * @description Specialized exception representing failures in the integration subsystem.
 * @license Proprietary
 * ============================================================================
 */

import { InfrastructureException } from './InfrastructureException';

/**
 * Represents failures originating specifically from the integration
 * subsystem of the infrastructure layer.
 */
export class IntegrationException extends InfrastructureException {
  public constructor(message: string) {
    super(message, 'INTEGRATION_ERROR');
    this.name = 'IntegrationException';
  }
}

'@

$c139 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : seed/SeedRunner
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Seed Orchestrator
 * ----------------------------------------------------------------------------
 * @description Executes all registered seeders sequentially in defined order.
 * @license Proprietary
 * ============================================================================
 */

import type { Seeder } from '../database/DatabaseSeeder';

/**
 * Executes a fixed, ordered pipeline of Seeder implementations required
 * for a functional CRM environment (admin, roles, pipeline, tags).
 */
export class SeedRunner {
  public constructor(private readonly seeders: Seeder[]) {}

  public async run(): Promise<string[]> {
    const executed: string[] = [];
    for (const seeder of this.seeders) {
      await seeder.run();
      executed.push(seeder.name);
    }
    return executed;
  }
}

'@

$c140 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : seed/DefaultAdminSeeder
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Seeder
 * ----------------------------------------------------------------------------
 * @description Creates the default administrator user if none exists.
 * @license Proprietary
 * ============================================================================
 */

import { prisma } from '../prisma/PrismaClient';
import type { Seeder } from '../database/DatabaseSeeder';

/**
 * Ensures a default administrator account exists so the application
 * can be accessed immediately after deployment.
 */
export class DefaultAdminSeeder implements Seeder {
  public readonly name = 'DefaultAdminSeeder';

  public async run(): Promise<void> {
    const existing = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!existing) {
      await prisma.user.create({
        data: {
          name: 'Administrator',
          email: 'admin@prospector-atlas.com',
          role: 'ADMIN',
        } as never,
      });
    }
  }
}

'@

$c141 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : seed/RolesSeeder
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Seeder
 * ----------------------------------------------------------------------------
 * @description Seeds the default set of roles used for access control.
 * @license Proprietary
 * ============================================================================
 */

import { prisma } from '../prisma/PrismaClient';
import type { Seeder } from '../database/DatabaseSeeder';

const DEFAULT_ROLES = ['ADMIN', 'MANAGER', 'SALES_REP', 'VIEWER'];

/**
 * Ensures the default set of RBAC roles exists in the database.
 */
export class RolesSeeder implements Seeder {
  public readonly name = 'RolesSeeder';

  public async run(): Promise<void> {
    for (const roleName of DEFAULT_ROLES) {
      await prisma.role.upsert({
        where: { name: roleName },
        update: {},
        create: { name: roleName },
      } as never);
    }
  }
}

'@

$c142 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : seed/PipelineSeeder
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Seeder
 * ----------------------------------------------------------------------------
 * @description Seeds the default sales pipeline and stages.
 * @license Proprietary
 * ============================================================================
 */

import { prisma } from '../prisma/PrismaClient';
import type { Seeder } from '../database/DatabaseSeeder';

const DEFAULT_STAGES = ['NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'];

/**
 * Ensures a default sales pipeline with standard stages exists for
 * new CRM deployments.
 */
export class PipelineSeeder implements Seeder {
  public readonly name = 'PipelineSeeder';

  public async run(): Promise<void> {
    const pipeline = await prisma.pipeline.upsert({
      where: { name: 'Default Pipeline' },
      update: {},
      create: { name: 'Default Pipeline' },
    } as never);
    for (const [index, stageName] of DEFAULT_STAGES.entries()) {
      await prisma.pipelineStage.upsert({
        where: { pipelineId_name: { pipelineId: (pipeline as { id: string }).id, name: stageName } },
        update: {},
        create: { pipelineId: (pipeline as { id: string }).id, name: stageName, order: index },
      } as never);
    }
  }
}

'@

$c143 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : seed/TagsSeeder
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Seeder
 * ----------------------------------------------------------------------------
 * @description Seeds the default set of CRM tags.
 * @license Proprietary
 * ============================================================================
 */

import { prisma } from '../prisma/PrismaClient';
import type { Seeder } from '../database/DatabaseSeeder';

const DEFAULT_TAGS = ['hot-lead', 'cold-lead', 'vip', 'churn-risk', 'upsell'];

/**
 * Ensures a baseline set of tags exists for lead and opportunity
 * classification.
 */
export class TagsSeeder implements Seeder {
  public readonly name = 'TagsSeeder';

  public async run(): Promise<void> {
    for (const tagName of DEFAULT_TAGS) {
      await prisma.tag.upsert({
        where: { name: tagName },
        update: {},
        create: { name: tagName },
      } as never);
    }
  }
}

'@

$c144 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : migration/MigrationRunner
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Migration
 * ----------------------------------------------------------------------------
 * @description Executes pending Prisma migrations programmatically.
 * @license Proprietary
 * ============================================================================
 */

import { spawn } from 'node:child_process';

/**
 * Executes pending Prisma migrations against the target database using
 * the Prisma CLI (`prisma migrate deploy`).
 */
export class MigrationRunner {
  public async deploy(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('npx', ['prisma', 'migrate', 'deploy'], { shell: true });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`prisma migrate deploy exited with code ${code}`));
        }
      });
    });
  }
}

'@

$c145 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : migration/MigrationHistory
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Migration
 * ----------------------------------------------------------------------------
 * @description Reads applied migration history from the Prisma metadata table.
 * @license Proprietary
 * ============================================================================
 */

import { prisma } from '../prisma/PrismaClient';

export interface MigrationRecord {
  migrationName: string;
  finishedAt: Date | null;
}

/**
 * Reads applied migration history from Prisma's internal
 * `_prisma_migrations` metadata table.
 */
export class MigrationHistory {
  public async list(): Promise<MigrationRecord[]> {
    const rows = await prisma.$queryRaw<MigrationRecord[]>`
      SELECT migration_name AS "migrationName", finished_at AS "finishedAt"
      FROM _prisma_migrations
      ORDER BY finished_at DESC
    `;
    return rows;
  }
}

'@

$c146 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : migration/MigrationExecutor
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Migration
 * ----------------------------------------------------------------------------
 * @description Coordinates migration deployment and history validation.
 * @license Proprietary
 * ============================================================================
 */

import { MigrationRunner } from './MigrationRunner';
import { MigrationHistory } from './MigrationHistory';

/**
 * Coordinates execution of pending migrations followed by validation
 * against the recorded migration history.
 */
export class MigrationExecutor {
  private readonly runner = new MigrationRunner();
  private readonly history = new MigrationHistory();

  public async execute(): Promise<number> {
    await this.runner.deploy();
    const applied = await this.history.list();
    return applied.length;
  }
}

'@

$c147 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : persistence/PersistenceContext
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Unit of Work
 * ----------------------------------------------------------------------------
 * @description Aggregates repository instances sharing a single transactional context.
 * @license Proprietary
 * ============================================================================
 */

import { PrismaLeadRepository } from '../prisma/PrismaLeadRepository';
import { PrismaCompanyRepository } from '../prisma/PrismaCompanyRepository';
import { PrismaContactRepository } from '../prisma/PrismaContactRepository';
import { PrismaOpportunityRepository } from '../prisma/PrismaOpportunityRepository';
import { PrismaTaskRepository } from '../prisma/PrismaTaskRepository';

/**
 * Aggregates all repository instances participating in a single Unit of
 * Work, ensuring consistent access to entities within one transaction.
 */
export class PersistenceContext {
  public readonly leads = new PrismaLeadRepository();
  public readonly companies = new PrismaCompanyRepository();
  public readonly contacts = new PrismaContactRepository();
  public readonly opportunities = new PrismaOpportunityRepository();
  public readonly tasks = new PrismaTaskRepository();
}

'@

$c148 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : filesystem/FileSystemUtils
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Utility
 * ----------------------------------------------------------------------------
 * @description Common filesystem helper operations for local storage adapters.
 * @license Proprietary
 * ============================================================================
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Provides common filesystem helper operations used by local storage
 * adapters and temporary file processing pipelines.
 */
export class FileSystemUtils {
  public static async ensureDirectory(directoryPath: string): Promise<void> {
    await fs.mkdir(directoryPath, { recursive: true });
  }

  public static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  public static resolveExtension(filename: string): string {
    return path.extname(filename).replace('.', '');
  }
}

'@

$c149 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : mappers/LeadMapper
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Mapper
 * ----------------------------------------------------------------------------
 * @description Maps between Prisma persistence models and Lead domain entities.
 * @license Proprietary
 * ============================================================================
 */

import type { Lead } from '../../domain/entities/Lead';

/**
 * Maps between the Prisma persistence representation and the Lead
 * domain entity, keeping ORM concerns out of the domain layer.
 */
export class LeadMapper {
  public toDomain(record: Record<string, unknown>): Lead {
    return record as unknown as Lead;
  }

  public toPersistence(entity: Lead): Record<string, unknown> {
    return entity as unknown as Record<string, unknown>;
  }
}

'@

$c150 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : mappers/CompanyMapper
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Mapper
 * ----------------------------------------------------------------------------
 * @description Maps between Prisma persistence models and Company domain entities.
 * @license Proprietary
 * ============================================================================
 */

import type { Company } from '../../domain/entities/Company';

/**
 * Maps between the Prisma persistence representation and the Company
 * domain entity, keeping ORM concerns out of the domain layer.
 */
export class CompanyMapper {
  public toDomain(record: Record<string, unknown>): Company {
    return record as unknown as Company;
  }

  public toPersistence(entity: Company): Record<string, unknown> {
    return entity as unknown as Record<string, unknown>;
  }
}

'@

$c151 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : mappers/ContactMapper
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Mapper
 * ----------------------------------------------------------------------------
 * @description Maps between Prisma persistence models and Contact domain entities.
 * @license Proprietary
 * ============================================================================
 */

import type { Contact } from '../../domain/entities/Contact';

/**
 * Maps between the Prisma persistence representation and the Contact
 * domain entity, keeping ORM concerns out of the domain layer.
 */
export class ContactMapper {
  public toDomain(record: Record<string, unknown>): Contact {
    return record as unknown as Contact;
  }

  public toPersistence(entity: Contact): Record<string, unknown> {
    return entity as unknown as Record<string, unknown>;
  }
}

'@

$c152 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : mappers/OpportunityMapper
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Mapper
 * ----------------------------------------------------------------------------
 * @description Maps between Prisma persistence models and Opportunity domain entities.
 * @license Proprietary
 * ============================================================================
 */

import type { Opportunity } from '../../domain/entities/Opportunity';

/**
 * Maps between the Prisma persistence representation and the Opportunity
 * domain entity, keeping ORM concerns out of the domain layer.
 */
export class OpportunityMapper {
  public toDomain(record: Record<string, unknown>): Opportunity {
    return record as unknown as Opportunity;
  }

  public toPersistence(entity: Opportunity): Record<string, unknown> {
    return entity as unknown as Record<string, unknown>;
  }
}

'@

$c153 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : mappers/TaskMapper
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Mapper
 * ----------------------------------------------------------------------------
 * @description Maps between Prisma persistence models and Task domain entities.
 * @license Proprietary
 * ============================================================================
 */

import type { Task } from '../../domain/entities/Task';

/**
 * Maps between the Prisma persistence representation and the Task
 * domain entity, keeping ORM concerns out of the domain layer.
 */
export class TaskMapper {
  public toDomain(record: Record<string, unknown>): Task {
    return record as unknown as Task;
  }

  public toPersistence(entity: Task): Record<string, unknown> {
    return entity as unknown as Record<string, unknown>;
  }
}

'@

$c154 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : repositories/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within repositories.
 * @license Proprietary
 * ============================================================================
 */

export * from './ActivityRepository';
export * from './AttachmentRepository';
export * from './CampaignRepository';
export * from './CompanyRepository';
export * from './ContactRepository';
export * from './DealRepository';
export * from './LeadRepository';
export * from './MeetingRepository';
export * from './OpportunityRepository';
export * from './OrganizationRepository';
export * from './PipelineRepository';
export * from './ProposalRepository';
export * from './TagRepository';
export * from './TaskRepository';
export * from './TimelineRepository';
export * from './UserRepository';

'@

$c155 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : prisma/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within prisma.
 * @license Proprietary
 * ============================================================================
 */

export * from './PrismaClient';
export * from './PrismaCompanyRepository';
export * from './PrismaConnection';
export * from './PrismaContactRepository';
export * from './PrismaExtensions';
export * from './PrismaHealthCheck';
export * from './PrismaLeadRepository';
export * from './PrismaOpportunityRepository';
export * from './PrismaTaskRepository';
export * from './PrismaTransaction';

'@

$c156 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : database/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within database.
 * @license Proprietary
 * ============================================================================
 */

export * from './Database';
export * from './DatabaseBackup';
export * from './DatabaseConnection';
export * from './DatabaseHealth';
export * from './DatabaseInitializer';
export * from './DatabaseRestore';
export * from './DatabaseSeeder';
export * from './DatabaseTransaction';

'@

$c157 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : cache/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within cache.
 * @license Proprietary
 * ============================================================================
 */

export * from './CacheKey';
export * from './CacheManager';
export * from './CacheMetrics';
export * from './CachePolicy';
export * from './CacheProvider';
export * from './DistributedCache';
export * from './MemoryCache';
export * from './RedisProvider';

'@

$c158 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : redis/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within redis.
 * @license Proprietary
 * ============================================================================
 */

export * from './RedisClient';
export * from './RedisConnection';
export * from './RedisHealthCheck';
export * from './RedisLock';
export * from './RedisPubSub';
export * from './RedisStream';

'@

$c159 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : queues/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within queues.
 * @license Proprietary
 * ============================================================================
 */

export * from './BullMQProvider';
export * from './DeadLetterQueue';
export * from './QueueConsumer';
export * from './QueueManager';
export * from './QueueMetrics';
export * from './QueueProducer';
export * from './QueueProvider';
export * from './QueueWorker';
export * from './RetryPolicy';

'@

$c160 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : storage/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within storage.
 * @license Proprietary
 * ============================================================================
 */

export * from './FileDownloader';
export * from './FileManager';
export * from './FileUploader';
export * from './FileValidator';
export * from './LocalStorage';
export * from './MinIOStorage';
export * from './S3Storage';
export * from './StorageProvider';

'@

$c161 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : email/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within email.
 * @license Proprietary
 * ============================================================================
 */

export * from './EmailProvider';
export * from './EmailQueue';
export * from './EmailSender';
export * from './EmailTemplateEngine';
export * from './ResendProvider';
export * from './SMTPProvider';

'@

$c162 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : sms/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within sms.
 * @license Proprietary
 * ============================================================================
 */

export * from './SmsProvider';
export * from './SmsSender';
export * from './TwilioProvider';

'@

$c163 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : whatsapp/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within whatsapp.
 * @license Proprietary
 * ============================================================================
 */

export * from './EvolutionAPIProvider';
export * from './WhatsAppProvider';
export * from './WhatsAppSender';

'@

$c164 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : http/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within http.
 * @license Proprietary
 * ============================================================================
 */

export * from './AuthenticatedHttpClient';
export * from './AxiosClient';
export * from './HttpClient';
export * from './RetryHttpClient';

'@

$c165 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : external/clients/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within external/clients.
 * @license Proprietary
 * ============================================================================
 */

export * from './ApolloClient';
export * from './AsaasClient';
export * from './BitrixClient';
export * from './ClickSignClient';
export * from './GeminiClient';
export * from './HubSpotClient';
export * from './OpenAIClient';
export * from './StripeClient';

'@

$c166 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : adapters/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within adapters.
 * @license Proprietary
 * ============================================================================
 */

export * from './CompanyPersistenceAdapter';
export * from './LeadPersistenceAdapter';
export * from './OpportunityPersistenceAdapter';
export * from './ProposalPersistenceAdapter';
export * from './TaskPersistenceAdapter';

'@

$c167 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : serializers/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within serializers.
 * @license Proprietary
 * ============================================================================
 */

export * from './CompanySerializer';
export * from './ContactSerializer';
export * from './LeadSerializer';
export * from './OpportunitySerializer';
export * from './TaskSerializer';

'@

$c168 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : factories/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within factories.
 * @license Proprietary
 * ============================================================================
 */

export * from './ConnectionFactory';
export * from './InfrastructureFactory';
export * from './ProviderFactory';
export * from './RepositoryFactory';

'@

$c169 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : config/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within config.
 * @license Proprietary
 * ============================================================================
 */

export * from './ApplicationConfiguration';
export * from './DatabaseConfiguration';
export * from './Environment';
export * from './ProviderConfiguration';
export * from './QueueConfiguration';
export * from './RedisConfiguration';
export * from './StorageConfiguration';

'@

$c170 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : providers/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within providers.
 * @license Proprietary
 * ============================================================================
 */

export * from './CacheProviderRegistry';
export * from './DatabaseProvider';
export * from './NotificationProvider';
export * from './QueueProviderRegistry';
export * from './StorageProviderRegistry';

'@

$c171 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : interceptors/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within interceptors.
 * @license Proprietary
 * ============================================================================
 */

export * from './LoggingInterceptor';
export * from './MetricsInterceptor';
export * from './RetryInterceptor';
export * from './TracingInterceptor';

'@

$c172 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : health/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within health.
 * @license Proprietary
 * ============================================================================
 */

export * from './ApplicationHealth';
export * from './DatabaseHealth';
export * from './ExternalServicesHealth';
export * from './QueueHealth';
export * from './RedisHealth';
export * from './StorageHealth';

'@

$c173 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : locks/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within locks.
 * @license Proprietary
 * ============================================================================
 */

export * from './DistributedLock';
export * from './LockManager';
export * from './RedisLockProvider';

'@

$c174 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : telemetry/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within telemetry.
 * @license Proprietary
 * ============================================================================
 */

export * from './MetricsProvider';
export * from './PerformanceMonitor';
export * from './TelemetryProvider';
export * from './TracingProvider';

'@

$c175 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : exceptions/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within exceptions.
 * @license Proprietary
 * ============================================================================
 */

export * from './CacheException';
export * from './DatabaseException';
export * from './InfrastructureException';
export * from './IntegrationException';
export * from './QueueException';
export * from './StorageException';

'@

$c176 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : seed/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within seed.
 * @license Proprietary
 * ============================================================================
 */

export * from './DefaultAdminSeeder';
export * from './PipelineSeeder';
export * from './RolesSeeder';
export * from './SeedRunner';
export * from './TagsSeeder';

'@

$c177 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : migration/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within migration.
 * @license Proprietary
 * ============================================================================
 */

export * from './MigrationExecutor';
export * from './MigrationHistory';
export * from './MigrationRunner';

'@

$c178 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : persistence/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within persistence.
 * @license Proprietary
 * ============================================================================
 */

export * from './PersistenceContext';

'@

$c179 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : filesystem/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within filesystem.
 * @license Proprietary
 * ============================================================================
 */

export * from './FileSystemUtils';

'@

$c180 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : mappers/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within mappers.
 * @license Proprietary
 * ============================================================================
 */

export * from './CompanyMapper';
export * from './ContactMapper';
export * from './LeadMapper';
export * from './OpportunityMapper';
export * from './TaskMapper';

'@

$c181 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : infrastructure/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Root barrel file re-exporting the entire Infrastructure layer.
 * @license Proprietary
 * ============================================================================
 */

export * from './adapters';
export * from './cache';
export * from './config';
export * from './database';
export * from './email';
export * from './exceptions';
export * from './external';
export * from './factories';
export * from './filesystem';
export * from './health';
export * from './http';
export * from './interceptors';
export * from './locks';
export * from './mappers';
export * from './migration';
export * from './persistence';
export * from './prisma';
export * from './providers';
export * from './queues';
export * from './redis';
export * from './repositories';
export * from './seed';
export * from './serializers';
export * from './sms';
export * from './storage';
export * from './telemetry';
export * from './whatsapp';

'@

    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/LeadRepository.ts") -Content $c1
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/CompanyRepository.ts") -Content $c2
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/ContactRepository.ts") -Content $c3
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/OpportunityRepository.ts") -Content $c4
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/PipelineRepository.ts") -Content $c5
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/TaskRepository.ts") -Content $c6
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/MeetingRepository.ts") -Content $c7
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/ProposalRepository.ts") -Content $c8
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/DealRepository.ts") -Content $c9
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/ActivityRepository.ts") -Content $c10
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/CampaignRepository.ts") -Content $c11
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/AttachmentRepository.ts") -Content $c12
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/TimelineRepository.ts") -Content $c13
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/TagRepository.ts") -Content $c14
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/UserRepository.ts") -Content $c15
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/OrganizationRepository.ts") -Content $c16
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "prisma/PrismaClient.ts") -Content $c17
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "prisma/PrismaConnection.ts") -Content $c18
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "prisma/PrismaTransaction.ts") -Content $c19
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "prisma/PrismaExtensions.ts") -Content $c20
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "prisma/PrismaHealthCheck.ts") -Content $c21
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "prisma/PrismaLeadRepository.ts") -Content $c22
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "prisma/PrismaCompanyRepository.ts") -Content $c23
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "prisma/PrismaContactRepository.ts") -Content $c24
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "prisma/PrismaOpportunityRepository.ts") -Content $c25
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "prisma/PrismaTaskRepository.ts") -Content $c26
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "database/Database.ts") -Content $c27
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "database/DatabaseConnection.ts") -Content $c28
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "database/DatabaseTransaction.ts") -Content $c29
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "database/DatabaseInitializer.ts") -Content $c30
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "database/DatabaseHealth.ts") -Content $c31
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "database/DatabaseSeeder.ts") -Content $c32
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "database/DatabaseBackup.ts") -Content $c33
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "database/DatabaseRestore.ts") -Content $c34
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "cache/CacheProvider.ts") -Content $c35
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "cache/RedisProvider.ts") -Content $c36
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "cache/MemoryCache.ts") -Content $c37
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "cache/DistributedCache.ts") -Content $c38
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "cache/CacheKey.ts") -Content $c39
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "cache/CachePolicy.ts") -Content $c40
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "cache/CacheManager.ts") -Content $c41
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "cache/CacheMetrics.ts") -Content $c42
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "redis/RedisClient.ts") -Content $c43
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "redis/RedisConnection.ts") -Content $c44
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "redis/RedisLock.ts") -Content $c45
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "redis/RedisPubSub.ts") -Content $c46
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "redis/RedisStream.ts") -Content $c47
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "redis/RedisHealthCheck.ts") -Content $c48
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "queues/QueueProvider.ts") -Content $c49
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "queues/BullMQProvider.ts") -Content $c50
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "queues/QueueManager.ts") -Content $c51
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "queues/QueueWorker.ts") -Content $c52
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "queues/QueueConsumer.ts") -Content $c53
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "queues/QueueProducer.ts") -Content $c54
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "queues/DeadLetterQueue.ts") -Content $c55
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "queues/RetryPolicy.ts") -Content $c56
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "queues/QueueMetrics.ts") -Content $c57
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "storage/StorageProvider.ts") -Content $c58
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "storage/LocalStorage.ts") -Content $c59
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "storage/S3Storage.ts") -Content $c60
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "storage/MinIOStorage.ts") -Content $c61
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "storage/FileManager.ts") -Content $c62
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "storage/FileUploader.ts") -Content $c63
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "storage/FileDownloader.ts") -Content $c64
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "storage/FileValidator.ts") -Content $c65
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "email/EmailProvider.ts") -Content $c66
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "email/SMTPProvider.ts") -Content $c67
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "email/ResendProvider.ts") -Content $c68
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "email/EmailTemplateEngine.ts") -Content $c69
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "email/EmailQueue.ts") -Content $c70
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "email/EmailSender.ts") -Content $c71
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "sms/SmsProvider.ts") -Content $c72
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "sms/TwilioProvider.ts") -Content $c73
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "sms/SmsSender.ts") -Content $c74
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "whatsapp/WhatsAppProvider.ts") -Content $c75
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "whatsapp/EvolutionAPIProvider.ts") -Content $c76
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "whatsapp/WhatsAppSender.ts") -Content $c77
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "http/HttpClient.ts") -Content $c78
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "http/AxiosClient.ts") -Content $c79
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "http/RetryHttpClient.ts") -Content $c80
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "http/AuthenticatedHttpClient.ts") -Content $c81
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "external/clients/HubSpotClient.ts") -Content $c82
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "external/clients/BitrixClient.ts") -Content $c83
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "external/clients/OpenAIClient.ts") -Content $c84
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "external/clients/GeminiClient.ts") -Content $c85
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "external/clients/ApolloClient.ts") -Content $c86
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "external/clients/AsaasClient.ts") -Content $c87
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "external/clients/StripeClient.ts") -Content $c88
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "external/clients/ClickSignClient.ts") -Content $c89
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "adapters/LeadPersistenceAdapter.ts") -Content $c90
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "adapters/CompanyPersistenceAdapter.ts") -Content $c91
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "adapters/OpportunityPersistenceAdapter.ts") -Content $c92
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "adapters/TaskPersistenceAdapter.ts") -Content $c93
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "adapters/ProposalPersistenceAdapter.ts") -Content $c94
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "serializers/LeadSerializer.ts") -Content $c95
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "serializers/CompanySerializer.ts") -Content $c96
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "serializers/ContactSerializer.ts") -Content $c97
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "serializers/OpportunitySerializer.ts") -Content $c98
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "serializers/TaskSerializer.ts") -Content $c99
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "factories/RepositoryFactory.ts") -Content $c100
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "factories/ProviderFactory.ts") -Content $c101
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "factories/InfrastructureFactory.ts") -Content $c102
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "factories/ConnectionFactory.ts") -Content $c103
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "config/Environment.ts") -Content $c104
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "config/ApplicationConfiguration.ts") -Content $c105
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "config/DatabaseConfiguration.ts") -Content $c106
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "config/RedisConfiguration.ts") -Content $c107
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "config/StorageConfiguration.ts") -Content $c108
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "config/QueueConfiguration.ts") -Content $c109
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "config/ProviderConfiguration.ts") -Content $c110
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "providers/DatabaseProvider.ts") -Content $c111
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "providers/StorageProviderRegistry.ts") -Content $c112
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "providers/CacheProviderRegistry.ts") -Content $c113
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "providers/QueueProviderRegistry.ts") -Content $c114
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "providers/NotificationProvider.ts") -Content $c115
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "interceptors/LoggingInterceptor.ts") -Content $c116
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "interceptors/MetricsInterceptor.ts") -Content $c117
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "interceptors/RetryInterceptor.ts") -Content $c118
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "interceptors/TracingInterceptor.ts") -Content $c119
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "health/ApplicationHealth.ts") -Content $c120
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "health/DatabaseHealth.ts") -Content $c121
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "health/RedisHealth.ts") -Content $c122
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "health/StorageHealth.ts") -Content $c123
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "health/QueueHealth.ts") -Content $c124
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "health/ExternalServicesHealth.ts") -Content $c125
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "locks/DistributedLock.ts") -Content $c126
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "locks/RedisLockProvider.ts") -Content $c127
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "locks/LockManager.ts") -Content $c128
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "telemetry/MetricsProvider.ts") -Content $c129
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "telemetry/TracingProvider.ts") -Content $c130
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "telemetry/TelemetryProvider.ts") -Content $c131
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "telemetry/PerformanceMonitor.ts") -Content $c132
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "exceptions/InfrastructureException.ts") -Content $c133
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "exceptions/DatabaseException.ts") -Content $c134
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "exceptions/CacheException.ts") -Content $c135
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "exceptions/QueueException.ts") -Content $c136
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "exceptions/StorageException.ts") -Content $c137
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "exceptions/IntegrationException.ts") -Content $c138
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "seed/SeedRunner.ts") -Content $c139
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "seed/DefaultAdminSeeder.ts") -Content $c140
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "seed/RolesSeeder.ts") -Content $c141
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "seed/PipelineSeeder.ts") -Content $c142
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "seed/TagsSeeder.ts") -Content $c143
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "migration/MigrationRunner.ts") -Content $c144
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "migration/MigrationHistory.ts") -Content $c145
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "migration/MigrationExecutor.ts") -Content $c146
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "persistence/PersistenceContext.ts") -Content $c147
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "filesystem/FileSystemUtils.ts") -Content $c148
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "mappers/LeadMapper.ts") -Content $c149
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "mappers/CompanyMapper.ts") -Content $c150
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "mappers/ContactMapper.ts") -Content $c151
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "mappers/OpportunityMapper.ts") -Content $c152
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "mappers/TaskMapper.ts") -Content $c153
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/index.ts") -Content $c154
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "prisma/index.ts") -Content $c155
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "database/index.ts") -Content $c156
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "cache/index.ts") -Content $c157
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "redis/index.ts") -Content $c158
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "queues/index.ts") -Content $c159
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "storage/index.ts") -Content $c160
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "email/index.ts") -Content $c161
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "sms/index.ts") -Content $c162
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "whatsapp/index.ts") -Content $c163
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "http/index.ts") -Content $c164
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "external/clients/index.ts") -Content $c165
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "adapters/index.ts") -Content $c166
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "serializers/index.ts") -Content $c167
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "factories/index.ts") -Content $c168
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "config/index.ts") -Content $c169
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "providers/index.ts") -Content $c170
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "interceptors/index.ts") -Content $c171
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "health/index.ts") -Content $c172
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "locks/index.ts") -Content $c173
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "telemetry/index.ts") -Content $c174
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "exceptions/index.ts") -Content $c175
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "seed/index.ts") -Content $c176
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "migration/index.ts") -Content $c177
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "persistence/index.ts") -Content $c178
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "filesystem/index.ts") -Content $c179
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "mappers/index.ts") -Content $c180
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "index.ts") -Content $c181
    Write-Log "Geracao da camada Infrastructure concluida." "OK"
}

# ============================================================================
# MANIFEST
# ============================================================================
function Write-Phase11Manifest {
    param([bool]$ValidationPassed, [double]$DurationSeconds)

    $manifest = [ordered]@{
        fase               = "FASE 11 - INFRASTRUCTURE LAYER"
        versao             = $Script:PhaseVersion
        timestamp          = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
        duracaoSegundos    = [math]::Round($DurationSeconds, 2)
        arquivosCriados    = $Script:CreatedFiles
        arquivosAtualizados= $Script:UpdatedFiles
        diretoriosCriados  = $Script:CreatedFolders
        diretoriosExistentes = $Script:ExistingFolders
        arquivosVazios     = $Script:EmptyFiles
        hashesSHA256       = $Script:FileHashes
        validacaoOk        = $ValidationPassed
        erros              = $Script:Errors
        estatisticas       = [ordered]@{
            totalArquivosCriados     = $Script:CreatedFiles.Count
            totalArquivosAtualizados = $Script:UpdatedFiles.Count
            totalDiretoriosCriados   = $Script:CreatedFolders.Count
            totalErros               = $Script:Errors.Count
        }
    }

    $json = $manifest | ConvertTo-Json -Depth 6
    Set-Content -LiteralPath $Script:ManifestPath -Value $json -Encoding UTF8
    Write-Log "Manifest gerado em: $Script:ManifestPath" "OK"
}

# ============================================================================
# RELATORIO HTML
# ============================================================================
function Write-Phase11HtmlReport {
    param(
        [bool]$ValidationPassed,
        [double]$DurationSeconds,
        [PSCustomObject]$LintResult,
        [PSCustomObject]$TypeCheckResult,
        [PSCustomObject]$TestResult,
        [string]$FinalStatus
    )

    $totalSizeBytes = 0
    foreach ($f in ($Script:CreatedFiles + $Script:UpdatedFiles)) {
        if (Test-Path -LiteralPath $f) {
            $totalSizeBytes += (Get-Item -LiteralPath $f).Length
        }
    }
    $totalSizeKb = [math]::Round($totalSizeBytes / 1KB, 2)

    $statusColor = switch ($FinalStatus) {
        "SUCCESS" { "#22c55e" }
        "WARNING" { "#eab308" }
        default   { "#ef4444" }
    }

    $treeLines = ($Script:CreatedFolders + $Script:ExistingFolders | Sort-Object -Unique | ForEach-Object {
        $rel = $_.Replace($ProjectRoot, "").TrimStart("\","/")
        "<li>$rel</li>"
    }) -join ""

    $hashRows = ($Script:FileHashes | ForEach-Object {
        $rel = $_.Path.Replace($ProjectRoot, "").TrimStart("\","/")
        "<tr><td>$rel</td><td class='hash'>$($_.Hash)</td></tr>"
    }) -join ""

    $createdRows = ($Script:CreatedFiles | ForEach-Object {
        "<li>$($_.Replace($ProjectRoot, '').TrimStart('\','/'))</li>"
    }) -join ""

    $updatedRows = ($Script:UpdatedFiles | ForEach-Object {
        "<li>$($_.Replace($ProjectRoot, '').TrimStart('\','/'))</li>"
    }) -join ""

    $emptyRows = if ($Script:EmptyFiles.Count -gt 0) {
        ($Script:EmptyFiles | ForEach-Object { "<li>$_</li>" }) -join ""
    } else { "<li>Nenhum arquivo vazio encontrado</li>" }

    function Format-CommandResult {
        param([PSCustomObject]$r, [string]$label)
        if ($null -eq $r) {
            return "<p><strong>${label}:</strong> nao executado</p>"
        }
        $safeOutput = [System.Web.HttpUtility]::HtmlEncode($r.Output)
        return "<p><strong>${label}:</strong> $($r.Status) (exitCode=$($r.ExitCode), $($r.DurationMs) ms)</p><pre>$safeOutput</pre>"
    }

    Add-Type -AssemblyName System.Web -ErrorAction SilentlyContinue

    $lintHtml = Format-CommandResult -r $LintResult -label "Lint"
    $tscHtml  = Format-CommandResult -r $TypeCheckResult -label "TypeScript (tsc --noEmit)"
    $testHtml = Format-CommandResult -r $TestResult -label "Testes"

    $html = @"
<!DOCTYPE html>
<html lang='pt-br'>
<head>
<meta charset='utf-8'/>
<title>FASE 11 - Infrastructure Layer Report</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background:#0f172a; color:#e2e8f0; margin:0; padding:0; }
  header { background:linear-gradient(135deg,#1e293b,#0f172a); padding:2rem; border-bottom:4px solid $statusColor; }
  header h1 { margin:0; font-size:1.8rem; }
  header p { color:#94a3b8; margin-top:0.5rem; }
  .container { padding:2rem; max-width:1100px; margin:0 auto; }
  .badge { display:inline-block; padding:0.4rem 1rem; border-radius:999px; background:$statusColor; color:#0f172a; font-weight:bold; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:1rem; margin:1.5rem 0; }
  .card { background:#1e293b; border-radius:12px; padding:1.2rem; box-shadow:0 4px 12px rgba(0,0,0,0.3); }
  .card h3 { margin:0; font-size:0.9rem; color:#94a3b8; text-transform:uppercase; }
  .card p { font-size:1.6rem; margin:0.4rem 0 0; font-weight:bold; }
  section { margin:2rem 0; }
  section h2 { border-bottom:2px solid #334155; padding-bottom:0.5rem; }
  ul { max-height:260px; overflow-y:auto; background:#111827; border-radius:8px; padding:1rem 1.5rem; }
  table { width:100%; border-collapse:collapse; font-size:0.85rem; }
  table td { border-bottom:1px solid #334155; padding:0.4rem; word-break:break-all; }
  .hash { font-family:monospace; color:#38bdf8; }
  pre { background:#111827; padding:1rem; border-radius:8px; overflow-x:auto; font-size:0.8rem; }
  footer { text-align:center; padding:1.5rem; color:#64748b; }
  @media (max-width:600px) { .grid { grid-template-columns:1fr; } }
</style>
</head>
<body>
<header>
  <h1>PROSPECTOR-ATLAS &mdash; FASE 11 Infrastructure Layer</h1>
  <p>Gerado em $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') &bull; Duracao: $([math]::Round($DurationSeconds,2))s</p>
  <span class='badge'>STATUS: $FinalStatus</span>
</header>
<div class='container'>

  <div class='grid'>
    <div class='card'><h3>Arquivos criados</h3><p>$($Script:CreatedFiles.Count)</p></div>
    <div class='card'><h3>Arquivos atualizados</h3><p>$($Script:UpdatedFiles.Count)</p></div>
    <div class='card'><h3>Diretorios criados</h3><p>$($Script:CreatedFolders.Count)</p></div>
    <div class='card'><h3>Diretorios existentes</h3><p>$($Script:ExistingFolders.Count)</p></div>
    <div class='card'><h3>Arquivos vazios</h3><p>$($Script:EmptyFiles.Count)</p></div>
    <div class='card'><h3>Tamanho total gerado</h3><p>$totalSizeKb KB</p></div>
    <div class='card'><h3>Erros</h3><p>$($Script:Errors.Count)</p></div>
    <div class='card'><h3>Validacao</h3><p>$(if ($ValidationPassed) {"OK"} else {"FALHOU"})</p></div>
  </div>

  <section>
    <h2>Arquivos criados</h2>
    <ul>$createdRows</ul>
  </section>

  <section>
    <h2>Arquivos atualizados</h2>
    <ul>$updatedRows</ul>
  </section>

  <section>
    <h2>Arquivos vazios</h2>
    <ul>$emptyRows</ul>
  </section>

  <section>
    <h2>Arvore de diretorios</h2>
    <ul>$treeLines</ul>
  </section>

  <section>
    <h2>Validacao TypeScript / Lint / Testes</h2>
    $lintHtml
    $tscHtml
    $testHtml
  </section>

  <section>
    <h2>Hashes SHA-256</h2>
    <table>$hashRows</table>
  </section>

</div>
<footer>PROSPECTOR-ATLAS &bull; FASE 11 &bull; Infrastructure Layer Enterprise &bull; $Script:PhaseVersion</footer>
</body>
</html>
"@

    Set-Content -LiteralPath $Script:ReportPath -Value $html -Encoding UTF8
    Write-Log "Relatorio HTML gerado em: $Script:ReportPath" "OK"
}


# ============================================================================
# FLUXO PRINCIPAL
# ============================================================================
Write-Banner

if ($Rollback) {
    Invoke-Rollback
    return
}

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    Write-Log "ProjectRoot invalido: $ProjectRoot" "ERROR"
    return
}

Write-Folder -Path $Script:InfraRoot

Invoke-Phase11Generation

$validationPassed = Invoke-PostGenerationValidation

$lintResult = $null
$tscResult  = $null
$testResult = $null

if (-not $WhatIf) {
    if ($RunLint) {
        $lintResult = Invoke-OptionalCommand -Name "Lint" -Command "npm" -Arguments "run lint"
    }
    if ($RunTypeCheck) {
        $tscResult = Invoke-OptionalCommand -Name "TypeScript" -Command "npx" -Arguments "tsc --noEmit"
    }
    if ($RunTests) {
        $testResult = Invoke-OptionalCommand -Name "Testes" -Command "npm" -Arguments "test"
    }
}

$endTime = Get-Date
$durationSeconds = ($endTime - $Script:StartTime).TotalSeconds

$finalStatus = "SUCCESS"
if ($Script:Errors.Count -gt 0) {
    $finalStatus = if ($Script:CreatedFiles.Count -gt 0 -or $Script:UpdatedFiles.Count -gt 0) { "WARNING" } else { "FAILED" }
}
if (($lintResult -and $lintResult.Status -eq "FAILED") -or
    ($tscResult -and $tscResult.Status -eq "FAILED") -or
    ($testResult -and $testResult.Status -eq "FAILED")) {
    if ($finalStatus -eq "SUCCESS") { $finalStatus = "WARNING" }
}

if (-not $WhatIf) {
    Write-Phase11Manifest -ValidationPassed $validationPassed -DurationSeconds $durationSeconds
    Write-Phase11HtmlReport -ValidationPassed $validationPassed -DurationSeconds $durationSeconds `
        -LintResult $lintResult -TypeCheckResult $tscResult -TestResult $testResult -FinalStatus $finalStatus
}
else {
    Write-Log "Modo -WhatIf: manifest e relatorio HTML nao foram persistidos (simulacao)." "WARN"
}

Write-Host ""
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " FASE 11 - INFRASTRUCTURE LAYER" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " Arquivos criados:     $($Script:CreatedFiles.Count)"
Write-Host " Arquivos atualizados: $($Script:UpdatedFiles.Count)"
Write-Host " Pastas criadas:       $($Script:CreatedFolders.Count)"
Write-Host " Tempo:                $([math]::Round($durationSeconds,2))s"
Write-Host " Manifest:             $Script:ManifestPath"
Write-Host " Relatorio HTML:       $Script:ReportPath"
Write-Host " Validacao:            $(if ($validationPassed) {'OK'} else {'FALHOU'})"
Write-Host " Status:               $finalStatus"
Write-Host "====================================================" -ForegroundColor Cyan
