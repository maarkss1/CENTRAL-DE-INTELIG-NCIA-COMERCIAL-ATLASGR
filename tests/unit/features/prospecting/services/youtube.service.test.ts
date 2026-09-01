/**
 * `youtube.service.ts` — metadados públicos (oEmbed) de UM vídeo já conhecido, gratuito e sem
 * chave. Cobre a validação de URL (só youtube.com/youtu.be) e a distinção entre "vídeo não
 * encontrado" (404) e qualquer outra falha do provider.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getYoutubeVideoInfo } from '@/features/prospecting/services/youtube.service.js';
import { resetProviderCacheForTests } from '@/features/prospecting/services/providerCache.js';

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(async () => {
  await resetProviderCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getYoutubeVideoInfo', () => {
  it('URL vazia devolve info:null sem tentar a rede', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await getYoutubeVideoInfo('  ');

    expect(result).toEqual({ info: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('URL de outro domínio é rejeitada sem tentar a rede', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await getYoutubeVideoInfo('https://vimeo.com/12345');

    expect(result.info).toBeNull();
    expect(result.error).toContain('YouTube');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('devolve os metadados no caminho feliz', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        title: 'Vídeo institucional',
        author_name: 'Empresa X',
        author_url: 'https://youtube.com/@empresax',
        thumbnail_url: 'https://i.ytimg.com/thumb.jpg',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getYoutubeVideoInfo('https://www.youtube.com/watch?v=abc123');

    expect(result).toEqual({
      info: {
        title: 'Vídeo institucional',
        authorName: 'Empresa X',
        authorUrl: 'https://youtube.com/@empresax',
        thumbnailUrl: 'https://i.ytimg.com/thumb.jpg',
        videoUrl: 'https://www.youtube.com/watch?v=abc123',
      },
    });
  });

  it('404 do oEmbed vira mensagem clara de "não encontrado", não um erro genérico', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404, {}));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getYoutubeVideoInfo('https://youtu.be/naoexiste');

    expect(result.info).toBeNull();
    expect(result.error).toContain('não encontrado');
  });
});
