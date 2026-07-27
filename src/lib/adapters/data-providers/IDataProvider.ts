import { IEnrichedLead, IProspectingFilter } from '../../../types/prospecting';

export interface IDataProvider {
  /**
   * Identificador único do provedor de dados
   */
  providerName: string;

  /**
   * Busca novas empresas baseadas nos filtros informados
   */
  search(filters: IProspectingFilter): Promise<Partial<IEnrichedLead>[]>;

  /**
   * Enriquece os dados de uma empresa específica
   */
  enrich(lead: Partial<IEnrichedLead>): Promise<Partial<IEnrichedLead>>;
}
