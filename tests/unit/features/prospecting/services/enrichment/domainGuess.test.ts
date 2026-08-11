/**
 * Normalização de telefone/e-mail exigida pela missão da Onda 2 do Agente 05: `guessWhatsappFromPhone`
 * é a heurística de normalização de telefone (só assume WhatsApp em celular BR real, DDD + 9 dígitos
 * começando em 9) e `resolveEmailStatus` traduz a checagem real de e-mail (MX/disposable) para o
 * vocabulário usado em `Contact.emailStatus`, rotulando dado inferido ("guessed") vs confirmado
 * ("verified") em vez de misturar os dois sem rótulo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../../src/features/prospecting/services/email-verification.service', () => ({
    checkEmailDeliverability: vi.fn(),
}));

import { checkEmailDeliverability } from '../../../../../../src/features/prospecting/services/email-verification.service';
import {
    guessWhatsappFromPhone,
    extractDomainFromWebsite,
    resolveEmailStatus,
} from '../../../../../../src/features/prospecting/services/enrichment/domainGuess.js';

const mockCheckEmailDeliverability = vi.mocked(checkEmailDeliverability);

beforeEach(() => {
    vi.clearAllMocks();
});

describe('guessWhatsappFromPhone — normalização de telefone', () => {
    it('reconhece celular BR válido (DDD + 9 dígitos começando em 9)', () => {
        expect(guessWhatsappFromPhone('(21) 99999-8888')).toBe('(21) 99999-8888');
    });

    it('reconhece celular BR com código do país (+55)', () => {
        expect(guessWhatsappFromPhone('+55 21 99999-8888')).toBe('+55 21 99999-8888');
    });

    it('rejeita telefone fixo (8 dígitos, sem o 9 inicial)', () => {
        expect(guessWhatsappFromPhone('(21) 3333-4444')).toBeNull();
    });

    it('rejeita string vazia/nula sem lançar', () => {
        expect(guessWhatsappFromPhone(null)).toBeNull();
        expect(guessWhatsappFromPhone(undefined)).toBeNull();
        expect(guessWhatsappFromPhone('')).toBeNull();
    });

    it('nunca inventa um número novo — sempre devolve o mesmo telefone recebido ou null', () => {
        const phone = '(11) 91234-5678';
        expect(guessWhatsappFromPhone(phone)).toBe(phone);
    });
});

describe('extractDomainFromWebsite', () => {
    it('extrai o hostname sem www de uma URL completa', () => {
        expect(extractDomainFromWebsite('https://www.dmslog.com.br/sobre')).toBe('dmslog.com.br');
    });

    it('aceita domínio sem protocolo', () => {
        expect(extractDomainFromWebsite('dmslog.com.br')).toBe('dmslog.com.br');
    });

    it('devolve null para entrada vazia/inválida', () => {
        expect(extractDomainFromWebsite(null)).toBeNull();
        expect(extractDomainFromWebsite(undefined)).toBeNull();
    });
});

describe('resolveEmailStatus — rotulagem de dado inferido vs. confirmado', () => {
    it('devolve null quando não há e-mail (não inventa status para dado ausente)', async () => {
        expect(await resolveEmailStatus(null)).toBeNull();
    });

    it('rotula como "verified" quando a checagem real (MX) confirma o domínio', async () => {
        mockCheckEmailDeliverability.mockResolvedValue({ email: 'contato@empresa.com.br', status: 'verified' });
        expect(await resolveEmailStatus('contato@empresa.com.br')).toBe('verified');
    });

    it('rotula como "invalid" quando a checagem real reprova (formato, descartável ou sem MX)', async () => {
        mockCheckEmailDeliverability.mockResolvedValue({
            email: 'foo@bar',
            status: 'invalid',
            reason: 'no_mail_server',
        });
        expect(await resolveEmailStatus('foo@bar')).toBe('invalid');
    });

    it('rotula como "guessed" (nunca "verified") quando a checagem é inconclusiva', async () => {
        mockCheckEmailDeliverability.mockResolvedValue({
            email: 'contato@empresa.com.br',
            status: 'unknown',
            reason: 'check_failed',
        });
        expect(await resolveEmailStatus('contato@empresa.com.br')).toBe('guessed');
    });
});
