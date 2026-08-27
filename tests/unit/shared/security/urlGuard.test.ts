import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `assertSafeExternalUrl` (promovido de `src/lib/adapters/crm/Bitrix24Adapter.ts`, onde nasceu só
 * para o webhook do Bitrix24, para `src/shared/security/urlGuard.ts`) é o único guard reutilizável
 * deste repositório contra SSRF em URL fornecida por usuário/tenant: webhook Bitrix24
 * (`client.ts`/`connections.ts`) e PABX 3CX (`threecx.service.ts`) já dependem dele hoje. Estes
 * testes cobrem a lógica real (sem mock do próprio guard) para as duas garantias que a auditoria
 * pediu: rejeita IP privado/loopback/metadata, aceita URL pública normal.
 *
 * Casos de IP literal (127.0.0.1, 169.254.169.254, 10.0.0.1, 8.8.8.8) não fazem DNS lookup —
 * `net.isIP` já resolve o caminho antes disso — então são determinísticos mesmo em ambiente de
 * teste sandboxed sem rede. O caso de hostname (DNS rebinding) mocka `node:dns/promises` para não
 * depender de resolução real.
 */

const lookupMock = vi.fn();
vi.mock('node:dns/promises', () => ({
    default: { lookup: (...args: unknown[]) => lookupMock(...args) },
    lookup: (...args: unknown[]) => lookupMock(...args),
}));

beforeEach(() => {
    vi.clearAllMocks();
});

describe('assertSafeExternalUrl — rejeita IP privado/loopback/metadata', () => {
    it('rejeita loopback IPv4 (127.0.0.1)', async () => {
        const { assertSafeExternalUrl } = await import('@/shared/security/urlGuard');
        await expect(assertSafeExternalUrl('https://127.0.0.1/')).rejects.toThrow(/não permitido/i);
    });

    it('rejeita o endpoint de metadados de nuvem (169.254.169.254)', async () => {
        const { assertSafeExternalUrl } = await import('@/shared/security/urlGuard');
        await expect(assertSafeExternalUrl('https://169.254.169.254/latest/meta-data/')).rejects.toThrow(
            /não permitido/i,
        );
    });

    it('rejeita bloco privado 10.0.0.0/8', async () => {
        const { assertSafeExternalUrl } = await import('@/shared/security/urlGuard');
        await expect(assertSafeExternalUrl('https://10.0.0.1/')).rejects.toThrow(/não permitido/i);
    });

    it('rejeita bloco privado 172.16.0.0/12', async () => {
        const { assertSafeExternalUrl } = await import('@/shared/security/urlGuard');
        await expect(assertSafeExternalUrl('https://172.16.5.5/')).rejects.toThrow(/não permitido/i);
    });

    it('rejeita bloco privado 192.168.0.0/16', async () => {
        const { assertSafeExternalUrl } = await import('@/shared/security/urlGuard');
        await expect(assertSafeExternalUrl('https://192.168.1.1/')).rejects.toThrow(/não permitido/i);
    });

    // Nota: `net.isIP('[::1]')` (hostname de URL IPv6 vem com colchetes) devolve 0 — o mesmo
    // comportamento pré-existente herdado de `Bitrix24Adapter.ts` (não alterado nesta promoção).
    // Um IPv6 literal na URL cai no caminho de DNS lookup em vez do de IP literal e acaba
    // rejeitado por "não foi possível resolver o host" (ENOTFOUND) em vez de "IP privado" — ainda
    // bloqueia o fetch, só que pelo motivo errado. Testado abaixo pelo caminho real que o produto
    // usa para IPv6 (endereço resolvido via DNS, não literal na URL): um hostname comum cujo DNS
    // aponta para loopback/link-local IPv6 precisa ser rejeitado do mesmo jeito que um IPv4
    // privado — é isso que `isPrivateOrReservedIp` cobre para os registros devolvidos pelo lookup.
    it('rejeita hostname cujo DNS resolve para loopback IPv6 (::1)', async () => {
        lookupMock.mockResolvedValue([{ address: '::1', family: 6 }]);
        const { assertSafeExternalUrl } = await import('@/shared/security/urlGuard');
        await expect(assertSafeExternalUrl('https://webhook.exemplo.com/')).rejects.toThrow(/não permitido/i);
    });

    it('rejeita hostname cujo DNS resolve para link-local IPv6 (fe80::)', async () => {
        lookupMock.mockResolvedValue([{ address: 'fe80::1', family: 6 }]);
        const { assertSafeExternalUrl } = await import('@/shared/security/urlGuard');
        await expect(assertSafeExternalUrl('https://webhook.exemplo.com/')).rejects.toThrow(/não permitido/i);
    });

    it('rejeita "localhost" mesmo sem ser um IP literal', async () => {
        const { assertSafeExternalUrl } = await import('@/shared/security/urlGuard');
        await expect(assertSafeExternalUrl('https://localhost/')).rejects.toThrow(/não permitido/i);
    });

    it('rejeita esquema não-HTTPS mesmo com host público', async () => {
        const { assertSafeExternalUrl } = await import('@/shared/security/urlGuard');
        await expect(assertSafeExternalUrl('http://8.8.8.8/')).rejects.toThrow(/https/i);
    });

    it('rejeita URL malformada', async () => {
        const { assertSafeExternalUrl } = await import('@/shared/security/urlGuard');
        await expect(assertSafeExternalUrl('não-é-uma-url')).rejects.toThrow(/inválid/i);
    });

    // Mitigação de DNS rebinding: mesmo um hostname "normal" é rejeitado se algum dos endereços
    // resolvidos for privado/reservado — não basta o primeiro registro ser público.
    it('rejeita hostname cujo DNS resolve para IP privado (DNS rebinding)', async () => {
        lookupMock.mockResolvedValue([
            { address: '203.0.113.10', family: 4 },
            { address: '10.0.0.5', family: 4 },
        ]);
        const { assertSafeExternalUrl } = await import('@/shared/security/urlGuard');
        await expect(assertSafeExternalUrl('https://webhook.exemplo.com/')).rejects.toThrow(
            /não permitido.*privado/i,
        );
    });

    it('rejeita hostname que não resolve (DNS falha/vazio)', async () => {
        lookupMock.mockResolvedValue([]);
        const { assertSafeExternalUrl } = await import('@/shared/security/urlGuard');
        await expect(assertSafeExternalUrl('https://host-inexistente.exemplo.com/')).rejects.toThrow(
            /resolver/i,
        );
    });
});

describe('assertSafeExternalUrl — aceita URL pública normal', () => {
    it('aceita IP público literal sobre HTTPS (8.8.8.8)', async () => {
        const { assertSafeExternalUrl } = await import('@/shared/security/urlGuard');
        await expect(assertSafeExternalUrl('https://8.8.8.8/')).resolves.toBeUndefined();
    });

    it('aceita hostname cujo DNS resolve só para IPs públicos', async () => {
        lookupMock.mockResolvedValue([{ address: '203.0.113.10', family: 4 }]);
        const { assertSafeExternalUrl } = await import('@/shared/security/urlGuard');
        await expect(assertSafeExternalUrl('https://webhook.exemplo.com/rest/1/token/')).resolves.toBeUndefined();
        expect(lookupMock).toHaveBeenCalledWith('webhook.exemplo.com', { all: true });
    });
});
