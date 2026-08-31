/**
 * Cobre a rota /api/prospecting/tools (prospecting-tools.routes.ts) — contrato HTTP das quatro
 * ferramentas standalone de prospecção (Google Places, Apollo, Hunter, status de configuração).
 *
 * Segue o mesmo padrão de src/features/integrations/google/__tests__/google.routes.test.ts: mocka
 * as camadas de serviço (que já têm seus próprios testes/já são reaproveitadas do orquestrador
 * multi-provider) e foca só no contrato do router — validação Zod, shape da resposta e como cada
 * erro de serviço vira resposta HTTP. `authenticateToken`/`requireTenant` não fazem parte deste
 * router (aplicados em server.ts ao montar `/api/prospecting/tools`) — o `req.user` é injetado
 * diretamente, como nos demais testes de rota do projeto.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../../../../shared/middlewares/errorHandler.js';

const discoverViaGooglePlacesMock = vi.fn();
const fetchKnownExclusionsMock = vi.fn();
const fetchApolloCandidatesMock = vi.fn();
const findPeopleViaDomainSearchMock = vi.fn();
const findEmailViaHunterMock = vi.fn();
const getPaidProspectingKeyMock = vi.fn();
const getProspectingProviderModeMock = vi.fn();
const searchGithubOrganizationsMock = vi.fn();
const getGithubOrganizationProfileMock = vi.fn();
const searchCompanyNewsMock = vi.fn();
const getYoutubeVideoInfoMock = vi.fn();

vi.mock('../../services/prospecting.service.js', () => ({
  discoverViaGooglePlaces: (...args: unknown[]) => discoverViaGooglePlacesMock(...args),
  fetchKnownExclusions: (...args: unknown[]) => fetchKnownExclusionsMock(...args),
}));

vi.mock('../../services/apollo.service.js', () => ({
  fetchApolloCandidates: (...args: unknown[]) => fetchApolloCandidatesMock(...args),
}));

vi.mock('../../services/hunter.service.js', () => ({
  findPeopleViaDomainSearch: (...args: unknown[]) => findPeopleViaDomainSearchMock(...args),
  findEmailViaHunter: (...args: unknown[]) => findEmailViaHunterMock(...args),
}));

vi.mock('../../services/github.service.js', () => ({
  searchGithubOrganizations: (...args: unknown[]) => searchGithubOrganizationsMock(...args),
  getGithubOrganizationProfile: (...args: unknown[]) => getGithubOrganizationProfileMock(...args),
}));

vi.mock('../../services/news.service.js', () => ({
  searchCompanyNews: (...args: unknown[]) => searchCompanyNewsMock(...args),
}));

vi.mock('../../services/youtube.service.js', () => ({
  getYoutubeVideoInfo: (...args: unknown[]) => getYoutubeVideoInfoMock(...args),
}));

vi.mock('../../../../config/prospecting-integrations.js', () => ({
  getPaidProspectingKey: (...args: unknown[]) => getPaidProspectingKeyMock(...args),
  getProspectingProviderMode: (...args: unknown[]) => getProspectingProviderModeMock(...args),
}));

import { prospectingToolsRoutes } from '../prospecting-tools.routes.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { user: { id: string; organizationId: string; role: string } }).user = {
      id: 'test-user',
      organizationId: 'org-1',
      role: 'ADMIN',
    };
    next();
  });
  app.use('/api/prospecting/tools', prospectingToolsRoutes);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchKnownExclusionsMock.mockResolvedValue({ size: 0 });
});

describe('GET /api/prospecting/tools/status', () => {
  it('devolve o status de configuração das três integrações pagas, sem expor as chaves', async () => {
    getProspectingProviderModeMock.mockReturnValue('hybrid');
    getPaidProspectingKeyMock.mockImplementation((name: string) =>
      name === 'APOLLO_API_KEY' ? 'secret-key' : undefined,
    );
    const app = buildApp();

    const res = await request(app).get('/api/prospecting/tools/status');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        providerMode: 'hybrid',
        googlePlaces: { configured: false },
        apollo: { configured: true },
        hunter: { configured: false },
        github: { configured: true },
        news: { configured: true },
        youtube: { configured: true },
      },
    });
    expect(JSON.stringify(res.body)).not.toContain('secret-key');
  });
});

describe('POST /api/prospecting/tools/github', () => {
  it('rejeita query com menos de 2 caracteres', async () => {
    const app = buildApp();

    const res = await request(app).post('/api/prospecting/tools/github').send({ query: 'a' });

    expect(res.status).toBe(400);
    expect(searchGithubOrganizationsMock).not.toHaveBeenCalled();
  });

  it('busca organizações e repassa o resultado', async () => {
    searchGithubOrganizationsMock.mockResolvedValue({
      organizations: [
        { login: 'atlasgr', htmlUrl: 'https://github.com/atlasgr', avatarUrl: 'https://x/a.png' },
      ],
    });
    const app = buildApp();

    const res = await request(app)
      .post('/api/prospecting/tools/github')
      .send({ query: 'atlasgr', limit: 5 });

    expect(res.status).toBe(200);
    expect(searchGithubOrganizationsMock).toHaveBeenCalledWith('atlasgr', 5);
    expect(res.body.data.organizations).toHaveLength(1);
  });
});

describe('POST /api/prospecting/tools/github/profile', () => {
  it('rejeita login inválido antes de consultar o GitHub', async () => {
    const app = buildApp();

    const res = await request(app)
      .post('/api/prospecting/tools/github/profile')
      .send({ login: 'não é um login válido' });

    expect(res.status).toBe(400);
    expect(getGithubOrganizationProfileMock).not.toHaveBeenCalled();
  });

  it('devolve o perfil encontrado', async () => {
    getGithubOrganizationProfileMock.mockResolvedValue({
      profile: {
        login: 'atlasgr',
        name: 'AtlasGR',
        description: null,
        blog: null,
        location: null,
        publicRepos: 3,
        htmlUrl: 'https://github.com/atlasgr',
        avatarUrl: 'https://x/a.png',
      },
    });
    const app = buildApp();

    const res = await request(app)
      .post('/api/prospecting/tools/github/profile')
      .send({ login: 'atlasgr' });

    expect(res.status).toBe(200);
    expect(getGithubOrganizationProfileMock).toHaveBeenCalledWith('atlasgr');
    expect(res.body.data.profile.login).toBe('atlasgr');
  });
});

describe('POST /api/prospecting/tools/news', () => {
  it('rejeita nome de empresa muito curto', async () => {
    const app = buildApp();

    const res = await request(app).post('/api/prospecting/tools/news').send({ companyName: 'ab' });

    expect(res.status).toBe(400);
    expect(searchCompanyNewsMock).not.toHaveBeenCalled();
  });

  it('busca menções de notícias e repassa o resultado', async () => {
    searchCompanyNewsMock.mockResolvedValue([
      {
        title: 'Empresa X expande frota',
        url: 'https://noticia.com/1',
        domain: 'noticia.com',
        seenAt: '20260101T000000Z',
      },
    ]);
    const app = buildApp();

    const res = await request(app)
      .post('/api/prospecting/tools/news')
      .send({ companyName: 'Empresa X Transportes' });

    expect(res.status).toBe(200);
    expect(searchCompanyNewsMock).toHaveBeenCalledWith('Empresa X Transportes');
    expect(res.body.data.mentions).toHaveLength(1);
  });
});

describe('POST /api/prospecting/tools/youtube', () => {
  it('rejeita URL inválida antes de consultar o YouTube', async () => {
    const app = buildApp();

    const res = await request(app)
      .post('/api/prospecting/tools/youtube')
      .send({ url: 'não-é-url' });

    expect(res.status).toBe(400);
    expect(getYoutubeVideoInfoMock).not.toHaveBeenCalled();
  });

  it('devolve os metadados do vídeo', async () => {
    getYoutubeVideoInfoMock.mockResolvedValue({
      info: {
        title: 'Vídeo',
        authorName: 'Canal',
        authorUrl: 'https://youtube.com/@canal',
        thumbnailUrl: 'https://x/t.jpg',
        videoUrl: 'https://youtube.com/watch?v=abc',
      },
    });
    const app = buildApp();

    const res = await request(app)
      .post('/api/prospecting/tools/youtube')
      .send({ url: 'https://youtube.com/watch?v=abc' });

    expect(res.status).toBe(200);
    expect(getYoutubeVideoInfoMock).toHaveBeenCalledWith('https://youtube.com/watch?v=abc');
    expect(res.body.data.info.title).toBe('Vídeo');
  });
});

describe('POST /api/prospecting/tools/google-places', () => {
  it('rejeita quando segmento está ausente (contrato do schema compartilhado)', async () => {
    const app = buildApp();

    const res = await request(app).post('/api/prospecting/tools/google-places').send({});

    expect(res.status).toBe(400);
    expect(discoverViaGooglePlacesMock).not.toHaveBeenCalled();
  });

  it('busca só via Google Places, aplicando as exclusões do tenant', async () => {
    fetchKnownExclusionsMock.mockResolvedValue({ size: 2 });
    discoverViaGooglePlacesMock.mockResolvedValue([{ tradeName: 'Transportadora ABC' }]);
    const app = buildApp();

    const res = await request(app)
      .post('/api/prospecting/tools/google-places')
      .send({ segmento: 'Transportadora', localizacao: 'São Paulo', quantidade: 5 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { candidates: [{ tradeName: 'Transportadora ABC' }] },
    });
    expect(fetchKnownExclusionsMock).toHaveBeenCalledWith('org-1');
    expect(discoverViaGooglePlacesMock).toHaveBeenCalledWith(
      expect.objectContaining({ segmento: 'Transportadora', quantidade: 5 }),
      5,
      { size: 2 },
    );
  });
});

describe('POST /api/prospecting/tools/apollo', () => {
  it('busca só via Apollo Organization Search e repassa o erro do provedor quando houver', async () => {
    fetchApolloCandidatesMock.mockResolvedValue({
      candidates: [],
      error: 'Apollo API respondeu 403',
    });
    const app = buildApp();

    const res = await request(app)
      .post('/api/prospecting/tools/apollo')
      .send({ segmento: 'Operador Logístico', quantidade: 10 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { candidates: [], error: 'Apollo API respondeu 403' },
    });
    expect(fetchApolloCandidatesMock).toHaveBeenCalledWith(
      expect.objectContaining({ segmento: 'Operador Logístico' }),
      10,
      expect.anything(),
    );
  });
});

describe('POST /api/prospecting/tools/hunter', () => {
  it('rejeita domínio inválido antes de chamar o Hunter.io', async () => {
    const app = buildApp();

    const res = await request(app)
      .post('/api/prospecting/tools/hunter')
      .send({ domain: 'não é um domínio' });

    expect(res.status).toBe(400);
    expect(findPeopleViaDomainSearchMock).not.toHaveBeenCalled();
  });

  it('normaliza o domínio e devolve os contatos encontrados', async () => {
    findPeopleViaDomainSearchMock.mockResolvedValue({
      contacts: [
        {
          name: 'Maria Silva',
          title: 'CEO',
          email: 'maria@empresa.com',
          phone: null,
          linkedin_url: null,
        },
      ],
    });
    const app = buildApp();

    const res = await request(app)
      .post('/api/prospecting/tools/hunter')
      .send({ domain: 'https://www.empresa.com.br/', limit: 5 });

    expect(res.status).toBe(200);
    expect(findPeopleViaDomainSearchMock).toHaveBeenCalledWith('empresa.com.br', 5);
    expect(res.body.data.contacts).toHaveLength(1);
  });
});

describe('POST /api/prospecting/tools/hunter/verify-email', () => {
  it('valida domínio e nome completo antes de consultar o Email Finder', async () => {
    findEmailViaHunterMock.mockResolvedValue({ email: 'joao@empresa.com', score: 92 });
    const app = buildApp();

    const res = await request(app)
      .post('/api/prospecting/tools/hunter/verify-email')
      .send({ domain: 'empresa.com.br', fullName: 'João Souza' });

    expect(res.status).toBe(200);
    expect(findEmailViaHunterMock).toHaveBeenCalledWith('empresa.com.br', 'João Souza');
    expect(res.body).toEqual({ success: true, data: { email: 'joao@empresa.com', score: 92 } });
  });
});
