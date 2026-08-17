import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { discoverCriteriaSchema } from '../schemas/discoverCriteria.schema.js';
import { discoverViaGooglePlaces, fetchKnownExclusions } from '../services/prospecting.service.js';
import type { ProspectCriteria } from '../services/prospecting.service.js';
import { fetchApolloCandidates } from '../services/apollo.service.js';
import { findPeopleViaDomainSearch, findEmailViaHunter } from '../services/hunter.service.js';
import { normalizeCompanyDomain } from '../utils/domain.js';
import { ExclusionSet } from '../utils/exclusionSet.js';
import { getPaidProspectingKey, getProspectingProviderMode } from '../../../config/prospecting-integrations.js';
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

async function resolveExclusions(req: Request): Promise<ExclusionSet> {
    const { organizationId } = (req as AuthRequest).user;
    return fetchKnownExclusions(organizationId);
}

/**
 * Status de configuração das três integrações pagas — só booleano, nunca a chave em si (AGENTS.md
 * desta pasta: "Chaves nunca no frontend"). Alimenta o badge "não configurado" da grade de
 * ferramentas e a mensagem explícita dentro de cada uma, em vez de uma lista vazia sem explicação
 * (AGENTS.md: "Não ocultar falha de provider"). Não faz nenhum ping de rede — só confere se a chave
 * existe e se PROSPECTING_PROVIDER_MODE=hybrid está ativo, para não consumir cota à toa.
 */
router.get('/status', (_req: Request, res: Response) => {
    res.json({
        success: true,
        data: {
            providerMode: getProspectingProviderMode(),
            googlePlaces: { configured: !!getPaidProspectingKey('GOOGLE_MAPS_API_KEY') },
            apollo: { configured: !!getPaidProspectingKey('APOLLO_API_KEY') },
            hunter: { configured: !!getPaidProspectingKey('HUNTER_API_KEY') },
        },
    });
});

// Ferramenta standalone: só Google Places (New) Text Search — sem Apollo/Nominatim como fallback,
// diferente do /discover multi-provider.
router.post('/google-places', validateRequest(discoverCriteriaSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const criteria = req.body as ProspectCriteria;
        const exclusions = await resolveExclusions(req);
        const candidates = await discoverViaGooglePlaces(criteria, criteria.quantidade || 10, exclusions);
        res.json({ success: true, data: { candidates } });
    } catch (error) {
        next(error);
    }
});

// Ferramenta standalone: só Apollo.io Organization Search — mesma função usada pelo /discover, mas
// chamada isolada (já é 100% Apollo, não precisa de nenhuma adaptação pra "isolar" a fonte).
router.post('/apollo', validateRequest(discoverCriteriaSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const criteria = req.body as ProspectCriteria;
        const exclusions = await resolveExclusions(req);
        const result = await fetchApolloCandidates(criteria, criteria.quantidade || 10, exclusions);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

// Ferramenta standalone: só Hunter.io Domain Search — descobre pessoas reais a partir de e-mails
// publicados num domínio, sem passar pelo People Search da Apollo.
router.post('/hunter', validateRequest(hunterDomainSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { domain, limit } = req.body as { domain: string; limit: number };
        const normalizedDomain = normalizeCompanyDomain(domain);
        if (!normalizedDomain) {
            res.status(400).json({ success: false, error: 'Informe um domínio válido da empresa (ex: empresa.com.br)' });
            return;
        }
        const result = await findPeopleViaDomainSearch(normalizedDomain, limit);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

// Ação secundária da ferramenta Hunter: verifica/encontra o e-mail de UMA pessoa já identificada
// (nome + domínio), via Hunter.io Email Finder.
router.post('/hunter/verify-email', validateRequest(hunterVerifyEmailSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { domain, fullName } = req.body as { domain: string; fullName: string };
        const normalizedDomain = normalizeCompanyDomain(domain);
        if (!normalizedDomain) {
            res.status(400).json({ success: false, error: 'Informe um domínio válido da empresa (ex: empresa.com.br)' });
            return;
        }
        const result = await findEmailViaHunter(normalizedDomain, fullName);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

export const prospectingToolsRoutes = router;
