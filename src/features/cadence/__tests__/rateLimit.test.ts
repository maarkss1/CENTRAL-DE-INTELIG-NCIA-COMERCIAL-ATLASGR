import { describe, it, expect } from 'vitest';
import {
    DEFAULT_RATE_LIMIT_POLICY,
    decideRateLimitBlock,
    extractEmailDomain,
    isContactRateLimited,
    isDomainRateLimited,
    type CadenceRateLimitPolicy,
} from '../domain/rateLimit';

// Auditoria transversal (Agente 17): o módulo de cadência já tinha opt-out multicanal, stop on
// response/conversion, lock de concorrência e janela comercial real, mas nenhuma proteção contra o
// MESMO contato (ou o MESMO domínio de e-mail) recebendo toques em excesso quando várias
// cadências/campanhas diferentes miram o mesmo lead. Este arquivo cobre a lógica PURA de decisão
// (`domain/rateLimit.ts`); a contagem real (I/O, cruzando runs/cadências) é coberta em
// `rateLimitService.test.ts`.

describe('extractEmailDomain', () => {
    it('extrai o domínio em minúsculo de um e-mail válido', () => {
        expect(extractEmailDomain('Contato@Empresa.com.br')).toBe('empresa.com.br');
    });

    it('devolve null para valores que não são e-mail (sem @, vazio, terminando em @)', () => {
        expect(extractEmailDomain(null)).toBeNull();
        expect(extractEmailDomain(undefined)).toBeNull();
        expect(extractEmailDomain('')).toBeNull();
        expect(extractEmailDomain('sem-arroba')).toBeNull();
        expect(extractEmailDomain('@dominio.com')).toBeNull(); // sem local-part
        expect(extractEmailDomain('usuario@')).toBeNull(); // sem domínio
    });
});

describe('isContactRateLimited', () => {
    it('bloqueia quando o contato já atingiu o teto de toques da janela', () => {
        expect(isContactRateLimited(3, DEFAULT_RATE_LIMIT_POLICY)).toBe(true);
        expect(isContactRateLimited(4, DEFAULT_RATE_LIMIT_POLICY)).toBe(true); // acima do teto também bloqueia
    });

    it('libera quando o contato ainda está abaixo do teto', () => {
        expect(isContactRateLimited(0, DEFAULT_RATE_LIMIT_POLICY)).toBe(false);
        expect(isContactRateLimited(2, DEFAULT_RATE_LIMIT_POLICY)).toBe(false);
    });

    it('respeita uma política customizada (não hardcoded)', () => {
        const policy: CadenceRateLimitPolicy = { ...DEFAULT_RATE_LIMIT_POLICY, maxTouchesPerContactWindow: 1 };
        expect(isContactRateLimited(1, policy)).toBe(true);
        expect(isContactRateLimited(0, policy)).toBe(false);
    });
});

describe('isDomainRateLimited', () => {
    it('bloqueia um NOVO destinatário quando o domínio já atingiu o teto do dia', () => {
        const policy: CadenceRateLimitPolicy = { ...DEFAULT_RATE_LIMIT_POLICY, maxEmailRecipientsPerDomainPerDay: 20 };
        expect(isDomainRateLimited(20, false, policy)).toBe(true);
        expect(isDomainRateLimited(25, false, policy)).toBe(true);
    });

    it('libera quando o domínio ainda está abaixo do teto', () => {
        expect(isDomainRateLimited(5, false, DEFAULT_RATE_LIMIT_POLICY)).toBe(false);
    });

    it('nunca bloqueia por este motivo um contato que JÁ está entre os contados hoje — ele não é um destinatário novo', () => {
        const policy: CadenceRateLimitPolicy = { ...DEFAULT_RATE_LIMIT_POLICY, maxEmailRecipientsPerDomainPerDay: 1 };
        expect(isDomainRateLimited(1, true, policy)).toBe(false);
    });
});

describe('decideRateLimitBlock', () => {
    const policy: CadenceRateLimitPolicy = {
        maxTouchesPerContactWindow: 3,
        contactWindowHours: 24,
        maxEmailRecipientsPerDomainPerDay: 1,
    };

    it('sem nenhum sinal de bloqueio, devolve null', () => {
        expect(decideRateLimitBlock({ channel: 'email', sentTouchesInWindow: 0, domainCheck: null, policy })).toBeNull();
    });

    it('contato no teto bloqueia por contact-rate-limit, independente do canal', () => {
        expect(decideRateLimitBlock({ channel: 'whatsapp', sentTouchesInWindow: 3, domainCheck: null, policy })).toBe('contact-rate-limit');
        expect(decideRateLimitBlock({ channel: 'voice', sentTouchesInWindow: 3, domainCheck: null, policy })).toBe('contact-rate-limit');
    });

    it('domínio no teto bloqueia por domain-rate-limit, só para canal email', () => {
        const domainCheck = { distinctRecipientsToday: 1, currentLeadAlreadyCounted: false };
        expect(decideRateLimitBlock({ channel: 'email', sentTouchesInWindow: 0, domainCheck, policy })).toBe('domain-rate-limit');
    });

    it('domínio no teto NÃO bloqueia canal diferente de email (whatsapp/voice não têm limite de domínio)', () => {
        const domainCheck = { distinctRecipientsToday: 1, currentLeadAlreadyCounted: false };
        expect(decideRateLimitBlock({ channel: 'whatsapp', sentTouchesInWindow: 0, domainCheck, policy })).toBeNull();
    });

    it('contato tem precedência sobre domínio quando os dois estourariam', () => {
        const domainCheck = { distinctRecipientsToday: 1, currentLeadAlreadyCounted: false };
        expect(decideRateLimitBlock({ channel: 'email', sentTouchesInWindow: 3, domainCheck, policy })).toBe('contact-rate-limit');
    });
});
