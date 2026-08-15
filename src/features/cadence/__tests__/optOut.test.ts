import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryOptOutRepository } from '../infra/InMemoryOptOutRepository';
import { recordOptOut, isOptedOut, assertNotOptedOut, OptOutBlockedError } from '../application/optOutService';
import { normalizeOptOutSubject, hasAnyIdentifier, subjectsMatch, scopeBlocksChannel, type CadenceChannel } from '../domain/optOut';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const LEAD_ID = 'lead-1';

const CHANNELS: CadenceChannel[] = ['email', 'whatsapp', 'voice'];

function pairs<T>(items: T[]): Array<[T, T]> {
    const result: Array<[T, T]> = [];
    for (const a of items) {
        for (const b of items) {
            if (a !== b) result.push([a, b]);
        }
    }
    return result;
}

describe('normalizeOptOutSubject', () => {
    it('normaliza telefone para E.164 e e-mail para minúsculo/trim', () => {
        expect(normalizeOptOutSubject({ phoneE164: '(11) 99999-8888', email: '  Lead@Empresa.com  ' })).toEqual({
            leadId: null,
            email: 'lead@empresa.com',
            phoneE164: '+5511999998888',
        });
    });

    it('descarta telefone implausível e e-mail sem @ em vez de gravar lixo', () => {
        expect(normalizeOptOutSubject({ phoneE164: '123', email: 'nao-e-email' })).toEqual({
            leadId: null,
            email: null,
            phoneE164: null,
        });
    });

    it('passa leadId direto, só com trim', () => {
        expect(normalizeOptOutSubject({ leadId: '  lead-1  ' }).leadId).toBe('lead-1');
    });
});

describe('hasAnyIdentifier / subjectsMatch / scopeBlocksChannel', () => {
    it('sujeito totalmente vazio não tem identificador', () => {
        expect(hasAnyIdentifier({ leadId: null, email: null, phoneE164: null })).toBe(false);
    });

    it('casa por qualquer um dos três campos', () => {
        const record = { leadId: null, email: 'a@b.com', phoneE164: null };
        expect(subjectsMatch(record, { leadId: null, email: 'a@b.com', phoneE164: null })).toBe(true);
        expect(subjectsMatch(record, { leadId: null, email: 'outro@b.com', phoneE164: null })).toBe(false);
    });

    it('escopo global bloqueia qualquer canal; escopo de canal só bloqueia o próprio', () => {
        expect(scopeBlocksChannel('global', 'email')).toBe(true);
        expect(scopeBlocksChannel('voice', 'voice')).toBe(true);
        expect(scopeBlocksChannel('voice', 'email')).toBe(false);
    });
});

describe('recordOptOut + isOptedOut — matriz canal × canal', () => {
    let repo: InMemoryOptOutRepository;

    beforeEach(() => {
        repo = new InMemoryOptOutRepository();
    });

    it('sujeito sem identificador não é gravado e nunca fica bloqueado', async () => {
        const result = await recordOptOut(repo, {
            organizationId: ORG,
            scope: 'global',
            subject: {},
            originChannel: 'manual',
        });
        expect(result).toBeNull();
        expect(await isOptedOut(repo, ORG, {}, 'email')).toBe(false);
    });

    // Critério verificável do prompt: "opt-out registrado por WhatsApp bloqueia e-mail e
    // ligação, provado por teste para cada par de canais" — cobrimos as 6 combinações
    // ordenadas (origem × canal bloqueado), variando também o identificador conhecido no
    // momento do registro (telefone, quando a origem é whatsapp/voice; e-mail, quando é email),
    // e consultando com o LEAD completo (leadId + email + phoneE164), como o contrato com
    // 05/06/12 exige de cada canal real.
    for (const [origin, blockedChannel] of pairs(CHANNELS)) {
        it(`opt-out global registrado via ${origin} bloqueia disparo em ${blockedChannel}`, async () => {
            const subject =
                origin === 'email'
                    ? { leadId: LEAD_ID, email: 'lead@empresa.com' }
                    : { leadId: LEAD_ID, phoneE164: '11999998888' };

            await recordOptOut(repo, {
                organizationId: ORG,
                scope: 'global',
                subject,
                originChannel: origin,
                reason: 'Lead pediu para não ser mais contatado',
                evidence: 'Pode parar de mandar mensagem, por favor.',
            });

            const querySubject = { leadId: LEAD_ID, email: 'lead@empresa.com', phoneE164: '+5511999998888' };
            expect(await isOptedOut(repo, ORG, querySubject, blockedChannel)).toBe(true);
        });
    }

    it('opt-out restrito a um canal NÃO bloqueia os outros dois (sem super-bloqueio)', async () => {
        await recordOptOut(repo, {
            organizationId: ORG,
            scope: 'voice',
            subject: { leadId: LEAD_ID, phoneE164: '11999998888' },
            originChannel: 'voice',
            reason: 'Lead pediu para não ligarem mais, mas topa e-mail',
        });

        const subject = { leadId: LEAD_ID, email: 'lead@empresa.com', phoneE164: '+5511999998888' };
        expect(await isOptedOut(repo, ORG, subject, 'voice')).toBe(true);
        expect(await isOptedOut(repo, ORG, subject, 'email')).toBe(false);
        expect(await isOptedOut(repo, ORG, subject, 'whatsapp')).toBe(false);
    });

    it('casa por telefone mesmo sem leadId (webhook de opt-out antes do lead existir localmente)', async () => {
        await recordOptOut(repo, {
            organizationId: ORG,
            scope: 'global',
            subject: { phoneE164: '11999998888' },
            originChannel: 'whatsapp',
        });

        // Consulta feita por outro canal que só conhece o e-mail e o leadId (não o telefone) não
        // deve bloquear — não há identificador em comum.
        expect(await isOptedOut(repo, ORG, { leadId: 'outro-lead', email: 'outro@empresa.com' }, 'email')).toBe(false);
        // Consulta que inclui o mesmo telefone (mesmo sem leadId conhecido) bloqueia.
        expect(await isOptedOut(repo, ORG, { phoneE164: '+5511999998888' }, 'email')).toBe(true);
    });

    it('isola por organização — opt-out de um tenant nunca bloqueia outro', async () => {
        await recordOptOut(repo, {
            organizationId: ORG,
            scope: 'global',
            subject: { leadId: LEAD_ID, phoneE164: '11999998888' },
            originChannel: 'voice',
        });

        expect(await isOptedOut(repo, OTHER_ORG, { leadId: LEAD_ID, phoneE164: '+5511999998888' }, 'voice')).toBe(false);
    });

    it('assertNotOptedOut lança OptOutBlockedError quando bloqueado, e não lança quando livre', async () => {
        await recordOptOut(repo, {
            organizationId: ORG,
            scope: 'email',
            subject: { leadId: LEAD_ID, email: 'lead@empresa.com' },
            originChannel: 'email',
        });

        await expect(assertNotOptedOut(repo, ORG, { leadId: LEAD_ID, email: 'lead@empresa.com' }, 'email')).rejects.toThrow(
            OptOutBlockedError,
        );
        await expect(
            assertNotOptedOut(repo, ORG, { leadId: LEAD_ID, email: 'lead@empresa.com' }, 'whatsapp'),
        ).resolves.toBeUndefined();
    });

    it('idempotência de registro: dois pedidos do mesmo sujeito não impedem consulta de continuar bloqueada (nunca "desbloqueia" por acidente)', async () => {
        await recordOptOut(repo, {
            organizationId: ORG,
            scope: 'global',
            subject: { leadId: LEAD_ID, phoneE164: '11999998888' },
            originChannel: 'voice',
        });
        await recordOptOut(repo, {
            organizationId: ORG,
            scope: 'global',
            subject: { leadId: LEAD_ID, phoneE164: '11999998888' },
            originChannel: 'voice',
        });

        const list = await repo.list(ORG);
        expect(list.length).toBe(2); // auditoria preserva ambos os pedidos, não é preciso deduplicar para estar seguro
        expect(await isOptedOut(repo, ORG, { leadId: LEAD_ID }, 'email')).toBe(true);
    });
});
