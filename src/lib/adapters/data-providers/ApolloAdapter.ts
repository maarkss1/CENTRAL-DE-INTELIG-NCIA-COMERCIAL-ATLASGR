import { IDataProvider } from './IDataProvider';
import { IProspectingFilter } from '../../../types/prospecting';
import { IEnrichmentResult } from '../../../types/enrichment';
import { enrichOrganizationByDomain, enrichOrganizationWithContacts } from '../../../features/prospecting/services/apollo.service';

export class ApolloAdapter implements IDataProvider {
  providerName = 'Apollo.io';

  async search(filters: IProspectingFilter): Promise<Partial<IEnrichmentResult>[]> {
    return [];
  }

  async enrich(query: { cnpj?: string; name?: string; domain?: string; location?: string }): Promise<Partial<IEnrichmentResult>> {
    const startTime = Date.now();
    let domain = query.domain;

    if (!domain) {
       return {};
    }

    try {
       domain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

       const [orgResult, peopleResult] = await Promise.all([
           enrichOrganizationByDomain(domain),
           enrichOrganizationWithContacts(domain, 5)
       ]);

       const org = orgResult.organization;
       const contacts = peopleResult.contacts || [];

       if (!org && contacts.length === 0) {
           return {};
       }

       const decisionMakers = contacts.map(c => ({
           name: c.name,
           title: c.title,
           email: c.email,
           phone: c.phone,
           linkedin: c.linkedin_url
       }));

       return {
           company: org ? {
               tradeName: org.name,
               employeeCountEstimate: org.estimated_num_employees,
           } : undefined,
           social: org ? {
               linkedin: org.linkedin_url,
               twitter: org.twitter_url,
               facebook: org.facebook_url,
               website: org.website_url,
           } : undefined,
           contacts: {
               phones: org?.primary_phone?.number ? [org.primary_phone.number] : [],
               emails: [],
               decisionMakers
           },
           enrichment: {
               sources: [{ sourceName: this.providerName, extractedAt: new Date().toISOString() }],
               confidence: {
                   company: 75, // Estimativas do apollo
                   address: 0,
                   contacts: 85, // People Search da Apollo é bom
                   social: 95
               },
               timestamp: new Date().toISOString(),
               executionTime: Date.now() - startTime
           }
       };

    } catch (error) {
       console.error(`[ApolloAdapter] Request failed for domain ${domain}:`, error);
       return {};
    }
  }
}
