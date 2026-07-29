import { IProspectingFilter } from '../../../types/prospecting';
import { IEnrichmentResult } from '../../../types/enrichment';

export interface IDataProvider {
  /**
   * Identificador único do provedor de dados
   */
  providerName: string;

  /**
   * Busca novas empresas baseadas nos filtros informados
   */
  search(filters: IProspectingFilter): Promise<Partial<IEnrichmentResult>[]>;

  /**
   * Enriquece os dados de uma empresa específica (passando tipicamente cnpj, nome, ou site)
   */
  enrich(query: { cnpj?: string; name?: string; domain?: string; location?: string }): Promise<Partial<IEnrichmentResult>>;
}
