import { logger } from '../../../../lib/logger';
import { discoverCnpjByName } from '../cnpj.util';
import { enrichOrganizationWithContacts } from '../apollo.service';
import { searchCompanyNews } from '../news.service.js';
import { findCompanyDomain } from '../../utils/domain.js';
import { validContactEmails } from '../../../../shared/utils/contact-links';
import type { SearchExecutionTracker } from '../searchExecution.service.js';
import type { ProspectCandidate } from './types.js';

/**
 * Enriquecimento de qualidade rodado automaticamente ao final de toda busca (candidatos já
 * limitados a MAX_LEADS_PER_SEARCH): CNPJ (busca reversa por nome), decisores com LinkedIn/
 * e-mail/telefone (para candidatos que ainda não vieram com decisor pré-buscado da Apollo — ex:
 * Google Places/OpenStreetMap) e notícia/quebra-gelo recente. As três tarefas de um candidato
 * rodam em paralelo entre si, e todos os candidatos rodam em paralelo entre eles — o tempo total
 * fica limitado pelo orçamento em `discoverCandidates` (Promise.race), não pela soma dos custos.
 */
export async function enrichCandidatesWithQualityData(
  candidates: ProspectCandidate[],
  /** Onda 42: quando informado, cada chamada real de provider feita aqui (CNPJ/Receita Federal,
   * decisores via Apollo/Hunter, notícias) entra na mesma execução de busca rastreada pelo
   * Search-ID do chamador (ver discoverCandidates). Opcional — chamadores fora do fluxo de busca
   * (ex.: reprocessamento manual) continuam funcionando sem tracker. */
  tracker?: SearchExecutionTracker,
): Promise<void> {
  await Promise.allSettled(
    candidates.map(async (candidate) => {
      await Promise.allSettled([
        (async () => {
          if (candidate.cnpjGuess) return;
          try {
            const cnpj = await discoverCnpjByName(candidate.tradeName);
            if (cnpj) candidate.cnpjGuess = cnpj;
            tracker?.recordProviderCall({
              provider: 'receita_federal',
              resultCount: cnpj ? 1 : 0,
              status: 'ok',
            });
          } catch (err) {
            logger.error(
              { err, searchId: tracker?.searchId, companyName: candidate.tradeName },
              'Falha ao descobrir CNPJ do candidato',
            );
            tracker?.recordProviderCall({
              provider: 'receita_federal',
              resultCount: 0,
              status: 'error',
              errorMessage: err instanceof Error ? err.message : 'Falha ao descobrir CNPJ',
            });
          }
        })(),
        (async () => {
          if (candidate.decisionMakers) return; // já veio pré-buscado (Apollo) ou já tentamos antes
          const domain = findCompanyDomain(candidate.website, candidate.rationale);
          if (!domain) return;
          try {
            const { contacts, source } = await enrichOrganizationWithContacts(domain, 3);
            candidate.decisionMakers = contacts.map((c) => ({
              name: c.name,
              title: c.title,
              email: c.email,
              emailSource: c.email ? (source === 'hunter' ? 'hunter' : 'apollo') : undefined,
              phone: c.phone || null,
              linkedinUrl: c.linkedin_url,
            }));
            if (candidate.decisionMakers.length > 0) {
              candidate.emails = validContactEmails(candidate.decisionMakers.map((dm) => dm.email));
            }
            tracker?.recordProviderCall({
              provider: source ?? 'apollo',
              resultCount: contacts.length,
              status: 'ok',
            });
          } catch (err) {
            logger.error(
              { err, searchId: tracker?.searchId, companyName: candidate.tradeName, domain },
              'Falha ao buscar decisores do candidato',
            );
            tracker?.recordProviderCall({
              provider: 'apollo',
              resultCount: 0,
              status: 'error',
              errorMessage: err instanceof Error ? err.message : 'Falha ao buscar decisores',
            });
          }
        })(),
        (async () => {
          try {
            const mentions = await searchCompanyNews(candidate.tradeName);
            if (mentions && mentions.length > 0) {
              candidate.webInsights = mentions.map((m) => ({
                title: m.title,
                url: m.url,
                domain: m.domain,
              }));
              candidate.icebreakerHook = `📰 Fato Relevante / Notícia: "${mentions[0].title}" (${mentions[0].domain})`;
            }
            tracker?.recordProviderCall({
              provider: 'news_search',
              resultCount: mentions?.length ?? 0,
              status: 'ok',
            });
          } catch (err) {
            logger.error(
              { err, searchId: tracker?.searchId, companyName: candidate.tradeName },
              'Falha ao buscar notícias para candidato',
            );
            tracker?.recordProviderCall({
              provider: 'news_search',
              resultCount: 0,
              status: 'error',
              errorMessage: err instanceof Error ? err.message : 'Falha ao buscar notícias',
            });
          }
        })(),
      ]);
    }),
  );
}
