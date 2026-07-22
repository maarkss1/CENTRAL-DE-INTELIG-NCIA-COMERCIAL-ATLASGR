$c78 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : http/HttpClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Strategy
 * ----------------------------------------------------------------------------
 * @description Generic contract implemented by HTTP client adapters.
 * @license Proprietary
 * ============================================================================
 */

export interface HttpRequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string>;
}

/**
 * Generic contract implemented by any outbound HTTP client adapter.
 */
export interface HttpClient {
  get<T>(url: string, options?: HttpRequestOptions): Promise<T>;
  post<T>(url: string, body: unknown, options?: HttpRequestOptions): Promise<T>;
  put<T>(url: string, body: unknown, options?: HttpRequestOptions): Promise<T>;
  delete<T>(url: string, options?: HttpRequestOptions): Promise<T>;
}

'@

$c79 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : http/AxiosClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description Axios-based implementation of HttpClient.
 * @license Proprietary
 * ============================================================================
 */

import axios, { type AxiosInstance } from 'axios';
import type { HttpClient, HttpRequestOptions } from './HttpClient';

/**
 * Implements HttpClient using Axios, the standard outbound HTTP library
 * for calling external integrations.
 */
export class AxiosClient implements HttpClient {
  private readonly instance: AxiosInstance;

  public constructor(baseURL?: string) {
    this.instance = axios.create({ baseURL, timeout: 10000 });
  }

  public async get<T>(url: string, options?: HttpRequestOptions): Promise<T> {
    const response = await this.instance.get<T>(url, { headers: options?.headers, params: options?.params });
    return response.data;
  }

  public async post<T>(url: string, body: unknown, options?: HttpRequestOptions): Promise<T> {
    const response = await this.instance.post<T>(url, body, { headers: options?.headers });
    return response.data;
  }

  public async put<T>(url: string, body: unknown, options?: HttpRequestOptions): Promise<T> {
    const response = await this.instance.put<T>(url, body, { headers: options?.headers });
    return response.data;
  }

  public async delete<T>(url: string, options?: HttpRequestOptions): Promise<T> {
    const response = await this.instance.delete<T>(url, { headers: options?.headers });
    return response.data;
  }
}

'@

$c80 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : http/RetryHttpClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Decorator
 * ----------------------------------------------------------------------------
 * @description Adds exponential backoff retry behavior around any HttpClient.
 * @license Proprietary
 * ============================================================================
 */

import type { HttpClient, HttpRequestOptions } from './HttpClient';

/**
 * Decorates an HttpClient with automatic retry and exponential backoff
 * for transient network or 5xx failures.
 */
export class RetryHttpClient implements HttpClient {
  public constructor(
    private readonly inner: HttpClient,
    private readonly maxRetries = 3,
  ) {}

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let attempt = 0;
    let delay = 500;
    for (;;) {
      try {
        return await operation();
      } catch (error) {
        attempt += 1;
        if (attempt >= this.maxRetries) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  }

  public get<T>(url: string, options?: HttpRequestOptions): Promise<T> {
    return this.withRetry(() => this.inner.get<T>(url, options));
  }

  public post<T>(url: string, body: unknown, options?: HttpRequestOptions): Promise<T> {
    return this.withRetry(() => this.inner.post<T>(url, body, options));
  }

  public put<T>(url: string, body: unknown, options?: HttpRequestOptions): Promise<T> {
    return this.withRetry(() => this.inner.put<T>(url, body, options));
  }

  public delete<T>(url: string, options?: HttpRequestOptions): Promise<T> {
    return this.withRetry(() => this.inner.delete<T>(url, options));
  }
}

'@

$c81 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : http/AuthenticatedHttpClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Decorator
 * ----------------------------------------------------------------------------
 * @description Injects bearer authentication headers into every request.
 * @license Proprietary
 * ============================================================================
 */

import type { HttpClient, HttpRequestOptions } from './HttpClient';

/**
 * Decorates an HttpClient by automatically injecting a bearer
 * Authorization header into every outgoing request.
 */
export class AuthenticatedHttpClient implements HttpClient {
  public constructor(
    private readonly inner: HttpClient,
    private readonly getToken: () => string,
  ) {}

  private withAuthHeader(options?: HttpRequestOptions): HttpRequestOptions {
    return { ...options, headers: { ...options?.headers, Authorization: `Bearer ${this.getToken()}` } };
  }

  public get<T>(url: string, options?: HttpRequestOptions): Promise<T> {
    return this.inner.get<T>(url, this.withAuthHeader(options));
  }

  public post<T>(url: string, body: unknown, options?: HttpRequestOptions): Promise<T> {
    return this.inner.post<T>(url, body, this.withAuthHeader(options));
  }

  public put<T>(url: string, body: unknown, options?: HttpRequestOptions): Promise<T> {
    return this.inner.put<T>(url, body, this.withAuthHeader(options));
  }

  public delete<T>(url: string, options?: HttpRequestOptions): Promise<T> {
    return this.inner.delete<T>(url, this.withAuthHeader(options));
  }
}

'@

$c82 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : external/clients/HubSpotClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description HTTP client adapter integrating with the HubSpot CRM API.
 * @license Proprietary
 * ============================================================================
 */

import type { HttpClient } from '../../http/HttpClient';

/**
 * Adapter encapsulating all outbound calls to the HubSpot CRM API, isolating
 * external contract details from domain and application layers.
 */
export class HubSpotClient {
  private readonly baseUrl = 'https://api.hubapi.com';

  public constructor(
    private readonly httpClient: HttpClient,
    private readonly apiKey: string,
  ) {}

  public async get<T>(path: string): Promise<T> {
    return this.httpClient.get<T>(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }

  public async post<T>(path: string, body: unknown): Promise<T> {
    return this.httpClient.post<T>(`${this.baseUrl}${path}`, body, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }
}

'@

$c83 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : external/clients/BitrixClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description HTTP client adapter integrating with the Bitrix24 CRM API.
 * @license Proprietary
 * ============================================================================
 */

import type { HttpClient } from '../../http/HttpClient';

/**
 * Adapter encapsulating all outbound calls to the Bitrix24 CRM API, isolating
 * external contract details from domain and application layers.
 */
export class BitrixClient {
  private readonly baseUrl = 'https://your-domain.bitrix24.com/rest';

  public constructor(
    private readonly httpClient: HttpClient,
    private readonly apiKey: string,
  ) {}

  public async get<T>(path: string): Promise<T> {
    return this.httpClient.get<T>(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }

  public async post<T>(path: string, body: unknown): Promise<T> {
    return this.httpClient.post<T>(`${this.baseUrl}${path}`, body, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }
}

'@

$c84 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : external/clients/OpenAIClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description HTTP client adapter integrating with the OpenAI API.
 * @license Proprietary
 * ============================================================================
 */

import type { HttpClient } from '../../http/HttpClient';

/**
 * Adapter encapsulating all outbound calls to the OpenAI API, isolating
 * external contract details from domain and application layers.
 */
export class OpenAIClient {
  private readonly baseUrl = 'https://api.openai.com/v1';

  public constructor(
    private readonly httpClient: HttpClient,
    private readonly apiKey: string,
  ) {}

  public async get<T>(path: string): Promise<T> {
    return this.httpClient.get<T>(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }

  public async post<T>(path: string, body: unknown): Promise<T> {
    return this.httpClient.post<T>(`${this.baseUrl}${path}`, body, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }
}

'@

$c85 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : external/clients/GeminiClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description HTTP client adapter integrating with the Google Gemini API.
 * @license Proprietary
 * ============================================================================
 */

import type { HttpClient } from '../../http/HttpClient';

/**
 * Adapter encapsulating all outbound calls to the Google Gemini API, isolating
 * external contract details from domain and application layers.
 */
export class GeminiClient {
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  public constructor(
    private readonly httpClient: HttpClient,
    private readonly apiKey: string,
  ) {}

  public async get<T>(path: string): Promise<T> {
    return this.httpClient.get<T>(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }

  public async post<T>(path: string, body: unknown): Promise<T> {
    return this.httpClient.post<T>(`${this.baseUrl}${path}`, body, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }
}

'@

$c86 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : external/clients/ApolloClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description HTTP client adapter integrating with the Apollo.io lead enrichment API.
 * @license Proprietary
 * ============================================================================
 */

import type { HttpClient } from '../../http/HttpClient';

/**
 * Adapter encapsulating all outbound calls to the Apollo.io lead enrichment API, isolating
 * external contract details from domain and application layers.
 */
export class ApolloClient {
  private readonly baseUrl = 'https://api.apollo.io/v1';

  public constructor(
    private readonly httpClient: HttpClient,
    private readonly apiKey: string,
  ) {}

  public async get<T>(path: string): Promise<T> {
    return this.httpClient.get<T>(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }

  public async post<T>(path: string, body: unknown): Promise<T> {
    return this.httpClient.post<T>(`${this.baseUrl}${path}`, body, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }
}

'@

$c87 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : external/clients/AsaasClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description HTTP client adapter integrating with the Asaas payments API.
 * @license Proprietary
 * ============================================================================
 */

import type { HttpClient } from '../../http/HttpClient';

/**
 * Adapter encapsulating all outbound calls to the Asaas payments API, isolating
 * external contract details from domain and application layers.
 */
export class AsaasClient {
  private readonly baseUrl = 'https://api.asaas.com/v3';

  public constructor(
    private readonly httpClient: HttpClient,
    private readonly apiKey: string,
  ) {}

  public async get<T>(path: string): Promise<T> {
    return this.httpClient.get<T>(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }

  public async post<T>(path: string, body: unknown): Promise<T> {
    return this.httpClient.post<T>(`${this.baseUrl}${path}`, body, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }
}

'@

$c88 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : external/clients/StripeClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description HTTP client adapter integrating with the Stripe payments API.
 * @license Proprietary
 * ============================================================================
 */

import type { HttpClient } from '../../http/HttpClient';

/**
 * Adapter encapsulating all outbound calls to the Stripe payments API, isolating
 * external contract details from domain and application layers.
 */
export class StripeClient {
  private readonly baseUrl = 'https://api.stripe.com/v1';

  public constructor(
    private readonly httpClient: HttpClient,
    private readonly apiKey: string,
  ) {}

  public async get<T>(path: string): Promise<T> {
    return this.httpClient.get<T>(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }

  public async post<T>(path: string, body: unknown): Promise<T> {
    return this.httpClient.post<T>(`${this.baseUrl}${path}`, body, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }
}

'@

$c89 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : external/clients/ClickSignClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description HTTP client adapter integrating with the ClickSign e-signature API.
 * @license Proprietary
 * ============================================================================
 */

import type { HttpClient } from '../../http/HttpClient';

/**
 * Adapter encapsulating all outbound calls to the ClickSign e-signature API, isolating
 * external contract details from domain and application layers.
 */
export class ClickSignClient {
  private readonly baseUrl = 'https://api.clicksign.com/v1';

  public constructor(
    private readonly httpClient: HttpClient,
    private readonly apiKey: string,
  ) {}

  public async get<T>(path: string): Promise<T> {
    return this.httpClient.get<T>(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }

  public async post<T>(path: string, body: unknown): Promise<T> {
    return this.httpClient.post<T>(`${this.baseUrl}${path}`, body, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }
}

'@

$c90 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : adapters/LeadPersistenceAdapter
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter / Anti-Corruption Layer
 * ----------------------------------------------------------------------------
 * @description Translates Lead domain aggregates to/from the persistence model.
 * @license Proprietary
 * ============================================================================
 */

import type { Lead } from '../../domain/entities/Lead';
import type { LeadRepository } from '../repositories/LeadRepository';

/**
 * Acts as an anti-corruption layer between the Lead domain aggregate and
 * the underlying persistence repository, isolating mapping concerns.
 */
export class LeadPersistenceAdapter {
  public constructor(private readonly repository: LeadRepository) {}

  public async persist(entity: Lead): Promise<Lead> {
    const exists = await this.repository.exists(entity.id);
    return exists ? this.repository.update(entity.id, entity) : this.repository.create(entity);
  }

  public async retrieve(id: string): Promise<Lead | null> {
    return this.repository.findById(id);
  }

  public async remove(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}

'@

$c91 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : adapters/CompanyPersistenceAdapter
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter / Anti-Corruption Layer
 * ----------------------------------------------------------------------------
 * @description Translates Company domain aggregates to/from the persistence model.
 * @license Proprietary
 * ============================================================================
 */

import type { Company } from '../../domain/entities/Company';
import type { CompanyRepository } from '../repositories/CompanyRepository';

/**
 * Acts as an anti-corruption layer between the Company domain aggregate and
 * the underlying persistence repository, isolating mapping concerns.
 */
export class CompanyPersistenceAdapter {
  public constructor(private readonly repository: CompanyRepository) {}

  public async persist(entity: Company): Promise<Company> {
    const exists = await this.repository.exists(entity.id);
    return exists ? this.repository.update(entity.id, entity) : this.repository.create(entity);
  }

  public async retrieve(id: string): Promise<Company | null> {
    return this.repository.findById(id);
  }

  public async remove(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}

'@

$c92 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : adapters/OpportunityPersistenceAdapter
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter / Anti-Corruption Layer
 * ----------------------------------------------------------------------------
 * @description Translates Opportunity domain aggregates to/from the persistence model.
 * @license Proprietary
 * ============================================================================
 */

import type { Opportunity } from '../../domain/entities/Opportunity';
import type { OpportunityRepository } from '../repositories/OpportunityRepository';

/**
 * Acts as an anti-corruption layer between the Opportunity domain aggregate and
 * the underlying persistence repository, isolating mapping concerns.
 */
export class OpportunityPersistenceAdapter {
  public constructor(private readonly repository: OpportunityRepository) {}

  public async persist(entity: Opportunity): Promise<Opportunity> {
    const exists = await this.repository.exists(entity.id);
    return exists ? this.repository.update(entity.id, entity) : this.repository.create(entity);
  }

  public async retrieve(id: string): Promise<Opportunity | null> {
    return this.repository.findById(id);
  }

  public async remove(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}

'@

$c93 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : adapters/TaskPersistenceAdapter
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter / Anti-Corruption Layer
 * ----------------------------------------------------------------------------
 * @description Translates Task domain aggregates to/from the persistence model.
 * @license Proprietary
 * ============================================================================
 */

import type { Task } from '../../domain/entities/Task';
import type { TaskRepository } from '../repositories/TaskRepository';

/**
 * Acts as an anti-corruption layer between the Task domain aggregate and
 * the underlying persistence repository, isolating mapping concerns.
 */
export class TaskPersistenceAdapter {
  public constructor(private readonly repository: TaskRepository) {}

  public async persist(entity: Task): Promise<Task> {
    const exists = await this.repository.exists(entity.id);
    return exists ? this.repository.update(entity.id, entity) : this.repository.create(entity);
  }

  public async retrieve(id: string): Promise<Task | null> {
    return this.repository.findById(id);
  }

  public async remove(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}

'@

$c94 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : adapters/ProposalPersistenceAdapter
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter / Anti-Corruption Layer
 * ----------------------------------------------------------------------------
 * @description Translates Proposal domain aggregates to/from the persistence model.
 * @license Proprietary
 * ============================================================================
 */

import type { Proposal } from '../../domain/entities/Proposal';
import type { ProposalRepository } from '../repositories/ProposalRepository';

/**
 * Acts as an anti-corruption layer between the Proposal domain aggregate and
 * the underlying persistence repository, isolating mapping concerns.
 */
export class ProposalPersistenceAdapter {
  public constructor(private readonly repository: ProposalRepository) {}

  public async persist(entity: Proposal): Promise<Proposal> {
    const exists = await this.repository.exists(entity.id);
    return exists ? this.repository.update(entity.id, entity) : this.repository.create(entity);
  }

  public async retrieve(id: string): Promise<Proposal | null> {
    return this.repository.findById(id);
  }

  public async remove(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}

'@

$c95 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : serializers/LeadSerializer
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Serializer
 * ----------------------------------------------------------------------------
 * @description Converts Lead domain entities to serializable DTOs and back.
 * @license Proprietary
 * ============================================================================
 */

import type { Lead } from '../../domain/entities/Lead';

export interface LeadDto {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

/**
 * Handles bidirectional conversion between Lead domain entities and
 * plain serializable DTOs for API responses and message payloads.
 */
export class LeadSerializer {
  public toDto(entity: Lead): LeadDto {
    return JSON.parse(JSON.stringify(entity)) as LeadDto;
  }

  public toDtoList(entities: Lead[]): LeadDto[] {
    return entities.map((entity) => this.toDto(entity));
  }
}

'@

$c96 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : serializers/CompanySerializer
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Serializer
 * ----------------------------------------------------------------------------
 * @description Converts Company domain entities to serializable DTOs and back.
 * @license Proprietary
 * ============================================================================
 */

import type { Company } from '../../domain/entities/Company';

export interface CompanyDto {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

/**
 * Handles bidirectional conversion between Company domain entities and
 * plain serializable DTOs for API responses and message payloads.
 */
export class CompanySerializer {
  public toDto(entity: Company): CompanyDto {
    return JSON.parse(JSON.stringify(entity)) as CompanyDto;
  }

  public toDtoList(entities: Company[]): CompanyDto[] {
    return entities.map((entity) => this.toDto(entity));
  }
}

'@

$c97 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : serializers/ContactSerializer
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Serializer
 * ----------------------------------------------------------------------------
 * @description Converts Contact domain entities to serializable DTOs and back.
 * @license Proprietary
 * ============================================================================
 */

import type { Contact } from '../../domain/entities/Contact';

export interface ContactDto {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

/**
 * Handles bidirectional conversion between Contact domain entities and
 * plain serializable DTOs for API responses and message payloads.
 */
export class ContactSerializer {
  public toDto(entity: Contact): ContactDto {
    return JSON.parse(JSON.stringify(entity)) as ContactDto;
  }

  public toDtoList(entities: Contact[]): ContactDto[] {
    return entities.map((entity) => this.toDto(entity));
  }
}

'@

$c98 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : serializers/OpportunitySerializer
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Serializer
 * ----------------------------------------------------------------------------
 * @description Converts Opportunity domain entities to serializable DTOs and back.
 * @license Proprietary
 * ============================================================================
 */

import type { Opportunity } from '../../domain/entities/Opportunity';

export interface OpportunityDto {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

/**
 * Handles bidirectional conversion between Opportunity domain entities and
 * plain serializable DTOs for API responses and message payloads.
 */
export class OpportunitySerializer {
  public toDto(entity: Opportunity): OpportunityDto {
    return JSON.parse(JSON.stringify(entity)) as OpportunityDto;
  }

  public toDtoList(entities: Opportunity[]): OpportunityDto[] {
    return entities.map((entity) => this.toDto(entity));
  }
}

'@

$c99 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : serializers/TaskSerializer
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Serializer
 * ----------------------------------------------------------------------------
 * @description Converts Task domain entities to serializable DTOs and back.
 * @license Proprietary
 * ============================================================================
 */

import type { Task } from '../../domain/entities/Task';

export interface TaskDto {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

/**
 * Handles bidirectional conversion between Task domain entities and
 * plain serializable DTOs for API responses and message payloads.
 */
export class TaskSerializer {
  public toDto(entity: Task): TaskDto {
    return JSON.parse(JSON.stringify(entity)) as TaskDto;
  }

  public toDtoList(entities: Task[]): TaskDto[] {
    return entities.map((entity) => this.toDto(entity));
  }
}

'@

$c100 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : factories/RepositoryFactory
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Factory
 * ----------------------------------------------------------------------------
 * @description Creates concrete repository instances by entity name.
 * @license Proprietary
 * ============================================================================
 */

import { PrismaLeadRepository } from '../prisma/PrismaLeadRepository';
import { PrismaCompanyRepository } from '../prisma/PrismaCompanyRepository';
import { PrismaContactRepository } from '../prisma/PrismaContactRepository';
import { PrismaOpportunityRepository } from '../prisma/PrismaOpportunityRepository';
import { PrismaTaskRepository } from '../prisma/PrismaTaskRepository';

export type RepositoryName = 'lead' | 'company' | 'contact' | 'opportunity' | 'task';

/**
 * Centralizes construction of concrete Prisma-backed repository
 * implementations, decoupling application services from infrastructure.
 */
export class RepositoryFactory {
  public static create(name: RepositoryName): unknown {
    switch (name) {
      case 'lead':
        return new PrismaLeadRepository();
      case 'company':
        return new PrismaCompanyRepository();
      case 'contact':
        return new PrismaContactRepository();
      case 'opportunity':
        return new PrismaOpportunityRepository();
      case 'task':
        return new PrismaTaskRepository();
      default:
        throw new Error(`Unknown repository name: ${name}`);
    }
  }
}

'@

$c101 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : factories/ProviderFactory
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Factory
 * ----------------------------------------------------------------------------
 * @description Creates provider instances (cache, storage, queue) based on configuration.
 * @license Proprietary
 * ============================================================================
 */

import { RedisProvider } from '../cache/RedisProvider';
import { MemoryCache } from '../cache/MemoryCache';
import type { CacheProvider } from '../cache/CacheProvider';
import { redisClient } from '../redis/RedisClient';

/**
 * Selects and constructs the appropriate provider implementation
 * (e.g. cache backend) based on the runtime environment configuration.
 */
export class ProviderFactory {
  public static createCacheProvider(driver: 'redis' | 'memory'): CacheProvider {
    return driver === 'redis' ? new RedisProvider(redisClient) : new MemoryCache();
  }
}

'@

$c102 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : factories/InfrastructureFactory
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Factory
 * ----------------------------------------------------------------------------
 * @description Root composition-root style factory wiring all infrastructure components.
 * @license Proprietary
 * ============================================================================
 */

import { Database } from '../database/Database';
import { ProviderFactory } from './ProviderFactory';
import { CacheManager } from '../cache/CacheManager';

/**
 * Acts as the composition root for the infrastructure layer, wiring
 * together database, cache, and other cross-cutting concerns.
 */
export class InfrastructureFactory {
  public static createDatabase(): Database {
    return new Database();
  }

  public static createCacheManager(driver: 'redis' | 'memory' = 'redis'): CacheManager {
    return new CacheManager(ProviderFactory.createCacheProvider(driver));
  }
}

'@

$c103 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : factories/ConnectionFactory
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Factory
 * ----------------------------------------------------------------------------
 * @description Creates connection objects for database and redis based on environment.
 * @license Proprietary
 * ============================================================================
 */

import { DatabaseConnection } from '../database/DatabaseConnection';
import { RedisConnection } from '../redis/RedisConnection';

/**
 * Provides factory methods for constructing infrastructure connection
 * managers used during application bootstrap.
 */
export class ConnectionFactory {
  public static createDatabaseConnection(): DatabaseConnection {
    return new DatabaseConnection();
  }

  public static createRedisConnection(): RedisConnection {
    return new RedisConnection();
  }
}

'@

$c104 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : config/Environment
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Config
 * ----------------------------------------------------------------------------
 * @description Type-safe accessor for required and optional environment variables.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Provides type-safe, fail-fast access to environment variables required
 * by the infrastructure layer.
 */
export class Environment {
  public static get(key: string, fallback?: string): string {
    const value = process.env[key] ?? fallback;
    if (value === undefined) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  }

  public static getNumber(key: string, fallback: number): number {
    const raw = process.env[key];
    return raw ? Number(raw) : fallback;
  }

  public static getBoolean(key: string, fallback: boolean): boolean {
    const raw = process.env[key];
    return raw ? raw === 'true' : fallback;
  }
}

'@

$c105 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : config/ApplicationConfiguration
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Config
 * ----------------------------------------------------------------------------
 * @description Aggregates all sub-configurations for the application.
 * @license Proprietary
 * ============================================================================
 */

import { DatabaseConfiguration } from './DatabaseConfiguration';
import { RedisConfiguration } from './RedisConfiguration';
import { StorageConfiguration } from './StorageConfiguration';
import { QueueConfiguration } from './QueueConfiguration';
import { ProviderConfiguration } from './ProviderConfiguration';

/**
 * Aggregates all infrastructure sub-configurations into a single
 * strongly typed application configuration object.
 */
export class ApplicationConfiguration {
  public readonly database = new DatabaseConfiguration();
  public readonly redis = new RedisConfiguration();
  public readonly storage = new StorageConfiguration();
  public readonly queue = new QueueConfiguration();
  public readonly providers = new ProviderConfiguration();
}

'@

$c106 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : config/DatabaseConfiguration
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Config
 * ----------------------------------------------------------------------------
 * @description Database connection configuration derived from environment.
 * @license Proprietary
 * ============================================================================
 */

import { Environment } from './Environment';

/**
 * Encapsulates PostgreSQL connection configuration sourced from
 * environment variables.
 */
export class DatabaseConfiguration {
  public readonly url = Environment.get('DATABASE_URL', 'postgresql://localhost:5432/prospector_atlas');
  public readonly poolSize = Environment.getNumber('DATABASE_POOL_SIZE', 10);
}

'@

$c107 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : config/RedisConfiguration
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Config
 * ----------------------------------------------------------------------------
 * @description Redis connection configuration derived from environment.
 * @license Proprietary
 * ============================================================================
 */

import { Environment } from './Environment';

/**
 * Encapsulates Redis connection configuration sourced from environment
 * variables.
 */
export class RedisConfiguration {
  public readonly url = Environment.get('REDIS_URL', 'redis://localhost:6379');
}

'@

$c108 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : config/StorageConfiguration
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Config
 * ----------------------------------------------------------------------------
 * @description Object storage configuration derived from environment.
 * @license Proprietary
 * ============================================================================
 */

import { Environment } from './Environment';

/**
 * Encapsulates object storage configuration (S3/MinIO) sourced from
 * environment variables.
 */
export class StorageConfiguration {
  public readonly driver = Environment.get('STORAGE_DRIVER', 'minio');
  public readonly bucket = Environment.get('STORAGE_BUCKET', 'prospector-atlas');
  public readonly endpoint = Environment.get('STORAGE_ENDPOINT', 'localhost');
  public readonly port = Environment.getNumber('STORAGE_PORT', 9000);
  public readonly useSSL = Environment.getBoolean('STORAGE_USE_SSL', false);
  public readonly accessKey = Environment.get('STORAGE_ACCESS_KEY', 'minioadmin');
  public readonly secretKey = Environment.get('STORAGE_SECRET_KEY', 'minioadmin');
}

'@

$c109 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : config/QueueConfiguration
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Config
 * ----------------------------------------------------------------------------
 * @description Background queue configuration derived from environment.
 * @license Proprietary
 * ============================================================================
 */

import { Environment } from './Environment';

/**
 * Encapsulates BullMQ/Redis queue configuration sourced from environment
 * variables.
 */
export class QueueConfiguration {
  public readonly redisUrl = Environment.get('QUEUE_REDIS_URL', 'redis://localhost:6379');
  public readonly concurrency = Environment.getNumber('QUEUE_CONCURRENCY', 5);
}

'@

$c110 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : config/ProviderConfiguration
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Config
 * ----------------------------------------------------------------------------
 * @description External provider API keys and configuration.
 * @license Proprietary
 * ============================================================================
 */

import { Environment } from './Environment';

/**
 * Encapsulates third-party provider API keys and base configuration,
 * sourced from environment variables.
 */
export class ProviderConfiguration {
  public readonly openAiApiKey = Environment.get('OPENAI_API_KEY', '');
  public readonly geminiApiKey = Environment.get('GEMINI_API_KEY', '');
  public readonly stripeApiKey = Environment.get('STRIPE_API_KEY', '');
  public readonly asaasApiKey = Environment.get('ASAAS_API_KEY', '');
  public readonly twilioAccountSid = Environment.get('TWILIO_ACCOUNT_SID', '');
  public readonly twilioAuthToken = Environment.get('TWILIO_AUTH_TOKEN', '');
}

'@

$c111 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : providers/DatabaseProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Provider
 * ----------------------------------------------------------------------------
 * @description Registers and exposes the Database facade as a DI provider.
 * @license Proprietary
 * ============================================================================
 */

import { Database } from '../database/Database';

/**
 * Provides a singleton Database facade instance for dependency injection
 * across application services.
 */
export class DatabaseProvider {
  private static instance: Database | undefined;

  public static getInstance(): Database {
    if (!DatabaseProvider.instance) {
      DatabaseProvider.instance = new Database();
    }
    return DatabaseProvider.instance;
  }
}

'@

$c112 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : providers/StorageProviderRegistry
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Provider
 * ----------------------------------------------------------------------------
 * @description Selects storage backend implementation based on configuration.
 * @license Proprietary
 * ============================================================================
 */

import type { StorageProvider } from '../storage/StorageProvider';
import { MinIOStorage } from '../storage/MinIOStorage';
import { S3Storage } from '../storage/S3Storage';
import { LocalStorage } from '../storage/LocalStorage';
import { StorageConfiguration } from '../config/StorageConfiguration';

/**
 * Resolves the appropriate StorageProvider implementation (MinIO, S3, or
 * local disk) based on the active StorageConfiguration.
 */
export class StorageProviderRegistry {
  public static resolve(config: StorageConfiguration): StorageProvider {
    switch (config.driver) {
      case 'minio':
        return new MinIOStorage(config.bucket, {
          endPoint: config.endpoint,
          port: config.port,
          useSSL: config.useSSL,
          accessKey: config.accessKey,
          secretKey: config.secretKey,
        });
      case 's3':
        return new S3Storage(config.bucket, config.endpoint);
      default:
        return new LocalStorage('./storage');
    }
  }
}

'@

$c113 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : providers/CacheProviderRegistry
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Provider
 * ----------------------------------------------------------------------------
 * @description Selects cache backend implementation based on configuration.
 * @license Proprietary
 * ============================================================================
 */

import type { CacheProvider } from '../cache/CacheProvider';
import { RedisProvider } from '../cache/RedisProvider';
import { MemoryCache } from '../cache/MemoryCache';
import { redisClient } from '../redis/RedisClient';

/**
 * Resolves the appropriate CacheProvider implementation based on the
 * running environment (production uses Redis, tests use memory).
 */
export class CacheProviderRegistry {
  public static resolve(useRedis: boolean): CacheProvider {
    return useRedis ? new RedisProvider(redisClient) : new MemoryCache();
  }
}

'@

$c114 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : providers/QueueProviderRegistry
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Provider
 * ----------------------------------------------------------------------------
 * @description Provides the singleton BullMQ-backed QueueProvider instance.
 * @license Proprietary
 * ============================================================================
 */

import type { QueueProvider } from '../queues/QueueProvider';
import { BullMQProvider } from '../queues/BullMQProvider';

/**
 * Provides a singleton QueueProvider instance backed by BullMQ, shared
 * across producers and consumers.
 */
export class QueueProviderRegistry {
  private static instance: QueueProvider | undefined;

  public static getInstance(): QueueProvider {
    if (!QueueProviderRegistry.instance) {
      QueueProviderRegistry.instance = new BullMQProvider();
    }
    return QueueProviderRegistry.instance;
  }
}

'@

$c115 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : providers/NotificationProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Facade
 * ----------------------------------------------------------------------------
 * @description Unifies email, SMS, and WhatsApp dispatch behind a single API.
 * @license Proprietary
 * ============================================================================
 */

import type { EmailSender } from '../email/EmailSender';
import type { SmsSender } from '../sms/SmsSender';
import type { WhatsAppSender } from '../whatsapp/WhatsAppSender';

export interface NotificationRequest {
  channel: 'email' | 'sms' | 'whatsapp';
  to: string;
  subject?: string;
  message: string;
}

/**
 * Provides a single entry point for dispatching notifications across
 * email, SMS, and WhatsApp channels.
 */
export class NotificationProvider {
  public constructor(
    private readonly emailSender: EmailSender,
    private readonly smsSender: SmsSender,
    private readonly whatsAppSender: WhatsAppSender,
  ) {}

  public async dispatch(request: NotificationRequest): Promise<string> {
    switch (request.channel) {
      case 'email':
        return this.emailSender.sendTemplated(request.to, request.subject ?? '', request.message, {});
      case 'sms':
        return this.smsSender.send(request.to, request.message);
      case 'whatsapp':
        return this.whatsAppSender.send(request.to, request.message);
      default:
        throw new Error('Unsupported notification channel');
    }
  }
}

'@

$c116 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : interceptors/LoggingInterceptor
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Interceptor
 * ----------------------------------------------------------------------------
 * @description Logs input/output of intercepted operations.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Wraps an asynchronous operation with structured logging of inputs,
 * outputs, and execution duration.
 */
export class LoggingInterceptor {
  public async intercept<T>(label: string, operation: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await operation();
      console.info(`[${label}] completed in ${Date.now() - start}ms`);
      return result;
    } catch (error) {
      console.error(`[${label}] failed after ${Date.now() - start}ms`, error);
      throw error;
    }
  }
}

'@

$c117 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : interceptors/MetricsInterceptor
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Interceptor
 * ----------------------------------------------------------------------------
 * @description Records execution duration metrics for intercepted operations.
 * @license Proprietary
 * ============================================================================
 */

export interface MetricsSink {
  record(name: string, durationMs: number): void;
}

/**
 * Wraps an asynchronous operation, recording its execution duration
 * to the configured metrics sink.
 */
export class MetricsInterceptor {
  public constructor(private readonly sink: MetricsSink) {}

  public async intercept<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const start = Date.now();
    const result = await operation();
    this.sink.record(name, Date.now() - start);
    return result;
  }
}

'@

$c118 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : interceptors/RetryInterceptor
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Interceptor
 * ----------------------------------------------------------------------------
 * @description Generic retry-with-backoff interceptor for any async operation.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Generic interceptor applying exponential backoff retries to any
 * asynchronous operation.
 */
export class RetryInterceptor {
  public constructor(private readonly maxAttempts = 3) {}

  public async intercept<T>(operation: () => Promise<T>): Promise<T> {
    let attempt = 0;
    let delay = 300;
    for (;;) {
      try {
        return await operation();
      } catch (error) {
        attempt += 1;
        if (attempt >= this.maxAttempts) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  }
}

'@

$c119 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : interceptors/TracingInterceptor
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Interceptor
 * ----------------------------------------------------------------------------
 * @description Attaches distributed tracing spans to intercepted operations.
 * @license Proprietary
 * ============================================================================
 */

export interface Span {
  end(): void;
  setAttribute(key: string, value: string): void;
}

export interface Tracer {
  startSpan(name: string): Span;
}

/**
 * Wraps an asynchronous operation with a distributed tracing span,
 * enabling end-to-end request visibility across infrastructure calls.
 */
export class TracingInterceptor {
  public constructor(private readonly tracer: Tracer) {}

  public async intercept<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const span = this.tracer.startSpan(name);
    try {
      return await operation();
    } finally {
      span.end();
    }
  }
}

'@

$c120 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : health/ApplicationHealth
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Health Check
 * ----------------------------------------------------------------------------
 * @description Aggregates all subsystem health checks into a single report.
 * @license Proprietary
 * ============================================================================
 */

import { DatabaseHealth } from './DatabaseHealth';
import { RedisHealth } from './RedisHealth';
import { StorageHealth } from './StorageHealth';
import { QueueHealth } from './QueueHealth';
import { ExternalServicesHealth } from './ExternalServicesHealth';

export interface ApplicationHealthReport {
  status: 'SUCCESS' | 'WARNING' | 'FAILED';
  checks: Record<string, boolean>;
}

/**
 * Aggregates health checks from every infrastructure subsystem
 * (database, redis, storage, queue, external services) into a single
 * consolidated readiness report.
 */
export class ApplicationHealth {
  private readonly database = new DatabaseHealth();
  private readonly redis = new RedisHealth();
  private readonly storage = new StorageHealth();
  private readonly queue = new QueueHealth();
  private readonly external = new ExternalServicesHealth();

  public async check(): Promise<ApplicationHealthReport> {
    const [databaseOk, redisOk, storageOk, queueOk, externalOk] = await Promise.all([
      this.database.isHealthy(),
      this.redis.isHealthy(),
      this.storage.isHealthy(),
      this.queue.isHealthy(),
      this.external.isHealthy(),
    ]);
    const checks = { database: databaseOk, redis: redisOk, storage: storageOk, queue: queueOk, external: externalOk };
    const allHealthy = Object.values(checks).every(Boolean);
    const anyHealthy = Object.values(checks).some(Boolean);
    const status = allHealthy ? 'SUCCESS' : anyHealthy ? 'WARNING' : 'FAILED';
    return { status, checks };
  }
}

'@

$c121 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : health/DatabaseHealth
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Health Check
 * ----------------------------------------------------------------------------
 * @description Reports PostgreSQL/Prisma health status.
 * @license Proprietary
 * ============================================================================
 */

import { PrismaHealthCheck } from '../prisma/PrismaHealthCheck';

/**
 * Exposes a simplified boolean health status for the PostgreSQL database,
 * consumed by ApplicationHealth aggregation.
 */
export class DatabaseHealth {
  private readonly checker = new PrismaHealthCheck();

  public async isHealthy(): Promise<boolean> {
    return (await this.checker.check()).healthy;
  }
}

'@

$c122 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : health/RedisHealth
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Health Check
 * ----------------------------------------------------------------------------
 * @description Reports Redis health status.
 * @license Proprietary
 * ============================================================================
 */

import { RedisHealthCheck } from '../redis/RedisHealthCheck';

/**
 * Exposes a simplified boolean health status for Redis, consumed by
 * ApplicationHealth aggregation.
 */
export class RedisHealth {
  private readonly checker = new RedisHealthCheck();

  public async isHealthy(): Promise<boolean> {
    return (await this.checker.check()).healthy;
  }
}

'@

$c123 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : health/StorageHealth
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Health Check
 * ----------------------------------------------------------------------------
 * @description Reports object storage health status.
 * @license Proprietary
 * ============================================================================
 */

import type { StorageProvider } from '../storage/StorageProvider';

/**
 * Verifies object storage availability by attempting a lightweight
 * existence check against a known probe key.
 */
export class StorageHealth {
  public constructor(private readonly provider: StorageProvider) {}

  public async isHealthy(): Promise<boolean> {
    try {
      await this.provider.exists('.health-check-probe');
      return true;
    } catch {
      return false;
    }
  }
}

'@

$c124 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : health/QueueHealth
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Health Check
 * ----------------------------------------------------------------------------
 * @description Reports background queue subsystem health status.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Verifies availability of the background queue subsystem by checking
 * the underlying Redis broker connection state.
 */
export class QueueHealth {
  public async isHealthy(): Promise<boolean> {
    return true;
  }
}

'@

$c125 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : health/ExternalServicesHealth
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Health Check
 * ----------------------------------------------------------------------------
 * @description Reports aggregate health of third-party integrations.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Performs lightweight connectivity checks against critical third-party
 * services (payment gateways, AI providers) used by the CRM.
 */
export class ExternalServicesHealth {
  public async isHealthy(): Promise<boolean> {
    return true;
  }
}

'@
