import { IDataProvider } from '../../../lib/adapters/data-providers/IDataProvider';
import { IEnrichedLead, IProspectingFilter } from '../../../types/prospecting';

export class SearchEngineService {
  private providers: IDataProvider[];

  constructor(providers: IDataProvider[]) {
    this.providers = providers;
  }

  /**
   * Prospecta empresas através de múltiplas fontes paralelamente.
   */
  async prospect(filters: IProspectingFilter): Promise<Partial<IEnrichedLead>[]> {
    const searchPromises = this.providers.map((provider) =>
      provider.search(filters).catch((err) => {
        console.error(`[SearchEngine] Erro no provedor ${provider.providerName}:`, err);
        return [];
      })
    );

    const results = await Promise.all(searchPromises);
    const flatResults = results.flat() as unknown;
    
    // Regra: Nunca retornar dados duplicados.
    // Consolidação baseada em CNPJ ou Nome (similaridade)
    const consolidated = this.consolidateResults(flatResults);
    
    // Se filters.maxCompanies for definido, limitamos o resultado
    if (filters.maxCompanies && filters.maxCompanies > 0) {
      return consolidated.slice(0, filters.maxCompanies);
    }
    
    return consolidated;
  }

  /**
   * Consolida resultados para evitar duplicatas, agrupando por CNPJ ou nome aproximado.
   */
  private consolidateResults(leads: Partial<IEnrichedLead>[]): Partial<IEnrichedLead>[] {
    const map = new Map<string, Partial<IEnrichedLead>>();

    for (const lead of leads) {
      const key = lead.cnpj || lead.socialReason?.toLowerCase() || Math.random().toString();
      
      if (map.has(key)) {
        const existing = map.get(key)!;
        // Mesclar informações
        map.set(key, {
          ...existing,
          ...lead,
          sources: [...(existing.sources || []), ...(lead.sources || [])],
        });
      } else {
        map.set(key, lead);
      }
    }

    return Array.from(map.values());
  }
}
