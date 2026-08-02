import { Repository } from '../domain/Repository';

/**
 * Repositórios de listagem paginada e filtrada usados pelas features de CRM
 * (Company/Lead/Contact) seguem esse contrato adicional além do `Repository<T>`
 * genérico de `shared/domain/Repository`. Cada domínio tem seu próprio segundo
 * parâmetro de filtro (`query`, `status`, etc.), por isso ele é tipado como
 * `string | undefined` de forma genérica.
 */
export interface FilterablePaginatedRepository<T> {
    findAllWithFilters(
        organizationId: string,
        filter?: string,
        page?: number,
        limit?: number
    ): Promise<{ data: T[]; meta: unknown }>;
}

/** Contrato mínimo de repositório exigido pelo `BaseUseCases`. */
export type CrudRepository<T> = Repository<T> & FilterablePaginatedRepository<T>;

/**
 * Base genérica para Use Cases de CRUD escopados por `organizationId`.
 *
 * Extraída do ARCH-007: `CompanyUseCases`, `LeadUseCases` e `ContactUseCases`
 * duplicavam a mesma lógica de create/findById/findAll paginado/update/delete.
 * Esta classe concentra apenas essa parte 100% idêntica entre os três; toda
 * lógica específica de domínio (validação com zod, side effects como
 * enfileirar enriquecimento, exportações, etc.) permanece nas subclasses, que
 * expõem seus próprios métodos públicos com nomes de domínio (ex:
 * `findCompanies`, `createLead`) delegando para os métodos protegidos daqui.
 *
 * Não segue o pipeline `UseCase`/`Result`/`Either` de `shared/application/base`
 * porque esses três Use Cases hoje lançam exceções diretamente e retornam
 * dados "crus" — é isso que os Controllers (`CompanyController`,
 * `LeadController`, `ContactController`) esperam. Migrar para o pipeline
 * Result/Either mudaria o contrato observado pelos controllers e não faz
 * parte do escopo desta refatoração (ARCH-007 é sobre duplicação de CRUD, não
 * sobre adotar CQRS nessas features).
 */
export abstract class BaseUseCases<T, TRepository extends CrudRepository<T> = CrudRepository<T>> {
    protected constructor(protected readonly repository: TRepository) {}

    protected async findAll(organizationId: string, filter?: string, page: number = 1, limit: number = 50) {
        return this.repository.findAllWithFilters(organizationId, filter, page, limit);
    }

    protected async findById(organizationId: string, id: string): Promise<T | null> {
        return this.repository.findById!(organizationId, id);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected async create(organizationId: string, data: any): Promise<T> {
        return this.repository.create!(organizationId, data);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected async update(organizationId: string, id: string, data: any): Promise<T> {
        return this.repository.update!(organizationId, id, data);
    }

    protected async delete(organizationId: string, id: string): Promise<T | void> {
        return this.repository.delete!(organizationId, id);
    }
}
