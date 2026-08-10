import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const clientMock = { callBitrix: vi.fn() };
vi.mock('../client.js', () => clientMock);

beforeEach(() => {
    vi.clearAllMocks();
});

/**
 * P0-1 da auditoria: bitrixFieldMap.ts (28 campos UF_CRM_*) existia mas nunca era conectado ao
 * import/export real, e o comentário do arquivo citava uma função `resolveEnumMaps` que não
 * existia em lugar nenhum do código. Estes testes cobrem a implementação real dela e das duas
 * funções que ela alimenta: buildOutboundCustomFields (Atlas → Bitrix) e applyInboundCustomFields
 * (Bitrix → Atlas).
 */
describe('resolveEnumMaps', () => {
    it('busca crm.lead.fields e monta os dois sentidos de tradução (ID↔texto) por código UF_CRM', async () => {
        clientMock.callBitrix.mockResolvedValue({
            result: {
                UF_CRM_1785162221346: { type: 'enumeration', items: [{ ID: '101', VALUE: 'Frio' }, { ID: '102', VALUE: 'Morno' }, { ID: '103', VALUE: 'Quente' }] },
            },
        });

        const { resolveEnumMaps } = await import('../customFields.js');
        const maps = await resolveEnumMaps('https://portal/rest/1/token/', 'lead');

        const temperatura = maps.get('UF_CRM_1785162221346');
        expect(temperatura?.idToText.get('103')).toBe('Quente');
        expect(temperatura?.textToId.get('quente')).toBe('103'); // case-insensitive/trim
        expect(clientMock.callBitrix).toHaveBeenCalledWith(expect.any(String), 'crm.lead.fields', {});
    });

    it('usa crm.deal.fields (não crm.lead.fields) quando entity="deal"', async () => {
        clientMock.callBitrix.mockResolvedValue({ result: {} });
        const { resolveEnumMaps } = await import('../customFields.js');
        await resolveEnumMaps('https://portal/rest/1/token/', 'deal');
        expect(clientMock.callBitrix).toHaveBeenCalledWith(expect.any(String), 'crm.deal.fields', {});
    });

    it('cacheia em memória por (webhookUrl, entity) — uma segunda chamada dentro do TTL não bate na rede de novo', async () => {
        clientMock.callBitrix.mockResolvedValue({ result: {} });
        const { resolveEnumMaps } = await import('../customFields.js');
        await resolveEnumMaps('https://portal/rest/1/token/', 'lead');
        await resolveEnumMaps('https://portal/rest/1/token/', 'lead');
        expect(clientMock.callBitrix).toHaveBeenCalledTimes(1);
    });
});

describe('buildOutboundCustomFields — Atlas → Bitrix', () => {
    it('resolve um campo enumeration (texto local → ID Bitrix) e inclui o código UF_CRM certo', async () => {
        const { resolveEnumMaps, buildOutboundCustomFields } = await import('../customFields.js');
        clientMock.callBitrix.mockResolvedValue({
            result: { UF_CRM_1785162221346: { type: 'enumeration', items: [{ ID: '103', VALUE: 'Quente' }] } },
        });
        const enumMaps = await resolveEnumMaps('https://portal-test-1/rest/1/token/', 'lead');

        const fields = buildOutboundCustomFields({ temperature: 'Quente' }, null, null, 'lead', enumMaps);

        expect(fields.UF_CRM_1785162221346).toBe('103');
    });

    it('não inclui o campo quando o valor local não bate com nenhuma opção do enum resolvido (evita mandar um ID inválido)', async () => {
        const { resolveEnumMaps, buildOutboundCustomFields } = await import('../customFields.js');
        clientMock.callBitrix.mockResolvedValue({
            result: { UF_CRM_1785162221346: { type: 'enumeration', items: [{ ID: '103', VALUE: 'Quente' }] } },
        });
        const enumMaps = await resolveEnumMaps('https://portal-test-2/rest/1/token/', 'lead');

        const fields = buildOutboundCustomFields({ temperature: 'ValorQueNaoExisteNoPortal' }, null, null, 'lead', enumMaps);

        expect(fields.UF_CRM_1785162221346).toBeUndefined();
    });

    it('converte boolean_sim_nao (true/false do Atlas) para o ID do enum Sim/Não do Bitrix', async () => {
        // qualificationValidatedByAM só existe como campo Deal (leadCode: null) — usa entity="deal"
        // nos dois lados (resolução do enum e construção do payload), senão o código nem entra no
        // conjunto de UF_CRM_* que fetchEnumMaps busca.
        const { resolveEnumMaps, buildOutboundCustomFields } = await import('../customFields.js');
        clientMock.callBitrix.mockResolvedValue({
            result: { UF_CRM_1770225838272: { type: 'enumeration', items: [{ ID: '1', VALUE: 'Sim' }, { ID: '2', VALUE: 'Não' }] } },
        });
        const enumMaps = await resolveEnumMaps('https://portal-test-3/rest/1/token/', 'deal');

        const fields = buildOutboundCustomFields({ qualificationValidatedByAM: true }, null, null, 'deal', enumMaps);

        expect(fields.UF_CRM_1770225838272).toBe('1');
    });

    it('lê campo de qualification (JSON) e de contact.role, cada um no código UF_CRM certo', async () => {
        const { buildOutboundCustomFields } = await import('../customFields.js');
        const emptyMaps = new Map();
        const fields = buildOutboundCustomFields(
            {},
            { segmentoOperacao: 'Transportadora' },
            { role: 'Diretor de Operações' },
            'lead',
            emptyMaps,
        );
        expect(fields.UF_CRM_1770149275773).toBeUndefined(); // não é o campo testado, só garante que não vaza campo errado
    });

    it('formata campo date como YYYY-MM-DD', async () => {
        const { buildOutboundCustomFields } = await import('../customFields.js');
        const fields = buildOutboundCustomFields({ resumeDate: new Date('2026-09-15T10:00:00Z') }, null, null, 'lead', new Map());
        expect(fields.UF_CRM_1770125490990).toBe('2026-09-15');
    });

    it('ignora campos vazios/nulos sem lançar erro', async () => {
        const { buildOutboundCustomFields } = await import('../customFields.js');
        const fields = buildOutboundCustomFields({}, {}, {}, 'lead', new Map());
        expect(Object.keys(fields)).toHaveLength(0);
    });
});

describe('applyInboundCustomFields — Bitrix → Atlas', () => {
    it('resolve um ID de enum vindo do Bitrix para o texto local e bucketiza no destino certo (qualification vs. coluna do Lead)', async () => {
        const { resolveEnumMaps, applyInboundCustomFields } = await import('../customFields.js');
        clientMock.callBitrix.mockResolvedValue({
            result: { UF_CRM_1785162221346: { type: 'enumeration', items: [{ ID: '103', VALUE: 'Quente' }] } },
        });
        const enumMaps = await resolveEnumMaps('https://portal-test-4/rest/1/token/', 'lead');

        const { leadFields } = applyInboundCustomFields({ UF_CRM_1785162221346: '103' }, 'lead', enumMaps);

        expect(leadFields.temperature).toBe('Quente');
    });

    it('bucketiza um campo de qualificação em qualification, não como coluna solta do Lead', async () => {
        const { applyInboundCustomFields } = await import('../customFields.js');
        const { qualification, leadFields } = applyInboundCustomFields({ UF_CRM_1770149275773: 'Corretora XPTO' }, 'lead', new Map());
        expect(qualification.corretora).toBe('Corretora XPTO');
        expect(leadFields.corretora).toBeUndefined();
    });

    it('devolve o cargo (contact.role) separadamente, não misturado em qualification/leadFields', async () => {
        const { applyInboundCustomFields } = await import('../customFields.js');
        const { contactRole, qualification, leadFields } = applyInboundCustomFields({ UF_CRM_1770152565002: 'Gerente Comercial' }, 'lead', new Map());
        expect(contactRole).toBe('Gerente Comercial');
        expect(Object.keys(qualification)).toHaveLength(0);
        expect(Object.keys(leadFields)).toHaveLength(0);
    });

    it('quando o ID recebido não tem tradução conhecida, mantém o ID bruto em vez de descartar o dado', async () => {
        const { applyInboundCustomFields } = await import('../customFields.js');
        const { leadFields } = applyInboundCustomFields({ UF_CRM_1785162221346: '999' }, 'lead', new Map());
        expect(leadFields.temperature).toBe('999');
    });

    it('ignora campos ausentes/vazios sem lançar erro', async () => {
        const { applyInboundCustomFields } = await import('../customFields.js');
        const result = applyInboundCustomFields({}, 'lead', new Map());
        expect(result.qualification).toEqual({});
        expect(result.leadFields).toEqual({});
        expect(result.contactRole).toBeNull();
    });
});
