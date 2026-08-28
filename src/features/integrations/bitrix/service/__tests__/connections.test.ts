import { describe, it, expect, vi, beforeEach } from 'vitest';

// Gap real de auditoria (SSRF/upload security): `testBitrixConnection` lê `webhookUrl` JÁ
// persistida do banco e chama `testWebhook` (fetch real) SEM revalidar a URL contra SSRF antes —
// diferente de `connectBitrix`, que valida no momento do cadastro. Estes testes usam o guard REAL
// (`assertSafeExternalUrl`, não mockado) para provar de ponta a ponta que uma URL privada/loopback
// nunca chega a bater na rede por nenhum dos dois caminhos.
const bitrixConnectionMock = {
  findFirst: vi.fn(),
  create: vi.fn(),
};
vi.mock('@/lib/prisma', () => ({
  prisma: { bitrixConnection: bitrixConnectionMock },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/config/env', () => ({
  env: { PUBLIC_BASE_URL: 'https://app.exemplo.com.br' },
}));

const auditLogMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/audit/audit.service', () => ({
  AuditService: { log: (...args: unknown[]) => auditLogMock(...args) },
}));

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), { status: init.status ?? 200 });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('connectBitrix — SSRF real (guard não mockado)', () => {
  it('rejeita e nunca persiste um webhook apontando para IP privado/reservado', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const { connectBitrix } = await import('../connections.js');

    await expect(
      connectBitrix('org-a', 'https://169.254.169.254/rest/1/token/', 'Meu Bitrix'),
    ).rejects.toThrow(/não permitido/i);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(bitrixConnectionMock.create).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it('rejeita e nunca persiste um webhook apontando para loopback', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const { connectBitrix } = await import('../connections.js');

    await expect(
      connectBitrix('org-a', 'https://127.0.0.1/rest/1/token/', 'Meu Bitrix'),
    ).rejects.toThrow(/não permitido/i);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(bitrixConnectionMock.create).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  // IP público literal (não hostname) de propósito: `assertSafeExternalUrl` não é mockado neste
  // arquivo (guard real, ponta a ponta), e um hostname exigiria DNS lookup real — instável em
  // ambiente de teste sandboxed (mesmo motivo documentado em client.test.ts/threecx tests). Um
  // IP público literal exercita o mesmo caminho de aceitação sem depender de rede.
  it('conecta e persiste normalmente uma URL pública válida', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ result: 'ok' }));
    bitrixConnectionMock.create.mockResolvedValue({ id: 'conn-1' });
    const { connectBitrix } = await import('../connections.js');

    const result = await connectBitrix('org-a', 'https://8.8.8.8/rest/1/token/', 'AtlasGR');

    expect(result.id).toBe('conn-1');
    expect(bitrixConnectionMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: 'org-a' }),
      }),
    );
    fetchMock.mockRestore();
  });
});

describe('testBitrixConnection — gap de auditoria: revalida SSRF mesmo para conexão já persistida', () => {
  it('nunca bate na rede quando a URL persistida (após possível DNS rebinding) resolve para IP privado', async () => {
    // Simula uma conexão já persistida cuja URL literal aponta para um IP privado — o mesmo
    // efeito prático de um DNS rebinding acontecido depois do cadastro original (o cadastro
    // validou um IP público na época; agora o guard precisa recusar de novo).
    bitrixConnectionMock.findFirst.mockResolvedValue({
      webhookUrl: 'https://10.0.0.5/rest/1/token/',
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const { testBitrixConnection } = await import('../connections.js');

    await expect(testBitrixConnection('org-a', 'conn-1')).rejects.toThrow(/não permitido/i);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it('testa a conexão de verdade quando a URL persistida é pública', async () => {
    bitrixConnectionMock.findFirst.mockResolvedValue({
      webhookUrl: 'https://8.8.8.8/rest/1/token/',
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ result: 'ok' }));
    const { testBitrixConnection } = await import('../connections.js');

    const result = await testBitrixConnection('org-a', 'conn-1');

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
