import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { discoverCriteriaSchema } from '../schemas/discoverCriteria.schema.js';
import { discoverViaGooglePlaces, fetchKnownExclusions } from '../services/prospecting.service.js';
import type { ProspectCriteria } from '../services/prospecting.service.js';
import { fetchApolloCandidates } from '../services/apollo.service.js';
import { findPeopleViaDomainSearch, findEmailViaHunter } from '../services/hunter.service.js';
import {
  searchGithubOrganizations,
  getGithubOrganizationProfile,
} from '../services/github.service.js';
import { searchCompanyNews } from '../services/news.service.js';
import { getYoutubeVideoInfo } from '../services/youtube.service.js';
import { normalizeCompanyDomain } from '../utils/domain.js';
import { ExclusionSet } from '../utils/exclusionSet.js';
import {
  getPaidProspectingKey,
  getProspectingProviderMode,
} from '../../../config/prospecting-integrations.js';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { validateRequest } from '../../../shared/middlewares/validateRequest.js';

const router = Router();

const hunterDomainSchema = z.object({
  domain: z.string().trim().min(1, 'Informe um domínio da empresa').max(300),
  limit: z.number().int().min(1).max(50).default(10),
});

const hunterVerifyEmailSchema = z.object({
  domain: z.string().trim().min(1, 'Informe um domínio da empresa').max(300),
  fullName: z.string().trim().min(1, 'Informe o nome completo da pessoa').max(200),
});

const githubSearchSchema = z.object({
  query: z.string().trim().min(2, 'Informe ao menos 2 caracteres para buscar').max(200),
  limit: z.number().int().min(1).max(25).default(10),
});

const githubProfileSchema = z.object({
  login: z
    .string()
    .trim()
    .min(1, 'Informe o login da organização no GitHub')
    .max(100)
    .regex(/^[A-Za-z0-9-]+$/, 'Login do GitHub inválido'),
});

const newsSearchSchema = z.object({
  companyName: z.string().trim().min(3, 'Informe o nome da empresa (mín. 3 caracteres)').max(200),
});

const youtubeLookupSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, 'Informe a URL de um vídeo do YouTube')
    .max(500)
    .url('URL inválida'),
});

async function resolveExclusions(req: Request): Promise<ExclusionSet> {
  const { organizationId } = (req as AuthRequest).user;
  return fetchKnownExclusions(organizationId);
}

/**
 * Status de configuração das integrações — só booleano, nunca a chave em si (AGENTS.md desta
 * pasta: "Chaves nunca no frontend"). Alimenta o badge "não configurado" da grade de ferramentas e
 * a mensagem explícita dentro de cada uma, em vez de uma lista vazia sem explicação (AGENTS.md:
 * "Não ocultar falha de provider"). Não faz nenhum ping de rede — só confere se a chave existe e
 * se PROSPECTING_PROVIDER_MODE=hybrid está ativo, para não consumir cota à toa.
 *
 * GitHub, Notícias (GDELT) e YouTube (oEmbed) são gratuitos e sem chave — sempre `configured: true`,
 * nunca mostram o banner "não configurado".
 */
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      providerMode: getProspectingProviderMode(),
      googlePlaces: { configured: !!getPaidProspectingKey('GOOGLE_MAPS_API_KEY') },
      apollo: { configured: !!getPaidProspectingKey('APOLLO_API_KEY') },
      hunter: { configured: !!getPaidProspectingKey('HUNTER_API_KEY') },
      github: { configured: true },
      news: { configured: true },
      youtube: { configured: true },
    },
  });
});

// Ferramenta standalone: só Google Places (New) Text Search — sem Apollo/Nominatim como fallback,
// diferente do /discover multi-provider.
router.post(
  '/google-places',
  validateRequest(discoverCriteriaSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const criteria = req.body as ProspectCriteria;
      const exclusions = await resolveExclusions(req);
      const candidates = await discoverViaGooglePlaces(
        criteria,
        criteria.quantidade || 10,
        exclusions,
      );
      res.json({ success: true, data: { candidates } });
    } catch (error) {
      next(error);
    }
  },
);

// Ferramenta standalone: só Apollo.io Organization Search — mesma função usada pelo /discover, mas
// chamada isolada (já é 100% Apollo, não precisa de nenhuma adaptação pra "isolar" a fonte).
router.post(
  '/apollo',
  validateRequest(discoverCriteriaSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const criteria = req.body as ProspectCriteria;
      const exclusions = await resolveExclusions(req);
      const result = await fetchApolloCandidates(criteria, criteria.quantidade || 10, exclusions);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

// Ferramenta standalone: só Hunter.io Domain Search — descobre pessoas reais a partir de e-mails
// publicados num domínio, sem passar pelo People Search da Apollo.
router.post(
  '/hunter',
  validateRequest(hunterDomainSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { domain, limit } = req.body as { domain: string; limit: number };
      const normalizedDomain = normalizeCompanyDomain(domain);
      if (!normalizedDomain) {
        res.status(400).json({
          success: false,
          error: 'Informe um domínio válido da empresa (ex: empresa.com.br)',
        });
        return;
      }
      const result = await findPeopleViaDomainSearch(normalizedDomain, limit);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

// Ação secundária da ferramenta Hunter: verifica/encontra o e-mail de UMA pessoa já identificada
// (nome + domínio), via Hunter.io Email Finder.
router.post(
  '/hunter/verify-email',
  validateRequest(hunterVerifyEmailSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { domain, fullName } = req.body as { domain: string; fullName: string };
      const normalizedDomain = normalizeCompanyDomain(domain);
      if (!normalizedDomain) {
        res.status(400).json({
          success: false,
          error: 'Informe um domínio válido da empresa (ex: empresa.com.br)',
        });
        return;
      }
      const result = await findEmailViaHunter(normalizedDomain, fullName);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

// Ferramenta standalone: busca de organizações no GitHub (Search API pública, sem chave) — sinal
// de maturidade técnica de uma empresa-alvo, não substitui Apollo/Hunter.
router.post(
  '/github',
  validateRequest(githubSearchSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query, limit } = req.body as { query: string; limit: number };
      const result = await searchGithubOrganizations(query, limit);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

// Ação secundária da ferramenta GitHub: perfil completo de UMA organização já identificada
// (nome, descrição, site, localização) — chamada só ao "Salvar no CRM", não em toda linha da lista.
router.post(
  '/github/profile',
  validateRequest(githubProfileSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { login } = req.body as { login: string };
      const result = await getGithubOrganizationProfile(login);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

// Ferramenta standalone: menções recentes de imprensa sobre uma empresa (GDELT, gratuito, sem
// chave) — reusa `searchCompanyNews`, já usado hoje só internamente no cascade de enriquecimento
// (enrichment.service.ts), agora também exposto como busca isolada sob demanda.
router.post(
  '/news',
  validateRequest(newsSearchSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { companyName } = req.body as { companyName: string };
      const mentions = await searchCompanyNews(companyName);
      res.json({ success: true, data: { mentions } });
    } catch (error) {
      next(error);
    }
  },
);

// Ferramenta standalone: metadados públicos (oEmbed) de UM vídeo do YouTube já conhecido — não é
// busca por palavra-chave (isso exige YOUTUBE_API_KEY, fora do escopo "sem chave" desta ferramenta).
router.post(
  '/youtube',
  validateRequest(youtubeLookupSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { url } = req.body as { url: string };
      const result = await getYoutubeVideoInfo(url);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

export const prospectingToolsRoutes = router;
