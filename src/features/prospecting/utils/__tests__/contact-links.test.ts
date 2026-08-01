import { describe, expect, it } from 'vitest';
import {
    getTelephoneLink,
    getWhatsAppLink,
    validContactEmails,
    validContactPhones,
} from '../contact-links';

describe('contact links', () => {
    it('gera links de telefone e WhatsApp para números brasileiros', () => {
        expect(getTelephoneLink('(16) 99999-1234')).toBe('tel:+5516999991234');
        expect(getWhatsAppLink('(16) 99999-1234')).toBe('https://wa.me/5516999991234');
    });

    it('preserva números internacionais que já possuem código do país', () => {
        expect(getTelephoneLink('+1 415 555 0123')).toBe('tel:+14155550123');
        expect(getWhatsAppLink('+1 415 555 0123')).toBe('https://wa.me/14155550123');
    });

    it('remove e-mails, telefones inválidos e duplicados', () => {
        expect(validContactEmails(['COMERCIAL@EMPRESA.COM.BR', 'comercial@empresa.com.br', 'inválido'])).toEqual([
            'comercial@empresa.com.br',
        ]);
        expect(validContactPhones(['(16) 99999-1234', '(16) 99999-1234', '123'])).toEqual([
            '(16) 99999-1234',
        ]);
    });
});
