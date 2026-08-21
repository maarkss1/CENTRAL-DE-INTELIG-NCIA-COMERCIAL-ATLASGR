import { describe, expect, it } from 'vitest';
import { buildAssistantLocalContext, formatAssistantRecordContext, getAssistantRouteContext } from '../../../src/hooks/assistantContext';

describe('assistantContext', () => {
    it('descreve a rota comercial atual para o copiloto', () => {
        expect(getAssistantRouteContext('/app/crm').label).toBe('CRM / pipeline comercial');
        expect(getAssistantRouteContext('/app/companies/abc').label).toBe('Empresas / inteligência de contas');
    });

    it('inclui tipo, id, nome e resumo do registro aberto sem inventar dados externos', () => {
        expect(formatAssistantRecordContext({
            type: 'lead',
            id: 'lead-123',
            label: 'Renovação Frota Atlas',
            summary: 'Status: Proposta — temperatura: Quente',
        })).toContain('REGISTRO ABERTO NA TELA (lead): Renovação Frota Atlas\nID interno: lead-123\nResumo visível: Status: Proposta — temperatura: Quente');
    });

    it('unifica rota, registro e base interna em um único contexto enviado ao Studio', () => {
        const context = buildAssistantLocalContext({
            route: getAssistantRouteContext('/app/contacts'),
            activeRecord: { type: 'contact', id: 'contact-7', label: 'Maria Silva', summary: 'Diretora de Operações' },
            internalContext: 'MATRIZ DE QUALIFICAÇÃO: MEDDIC',
        });

        expect(context).toContain('ROTA ATUAL: Contatos (/app/contacts)');
        expect(context).toContain('REGISTRO ABERTO NA TELA (contato): Maria Silva');
        expect(context).toContain('BASE INTERNA SELECIONADA:\nMATRIZ DE QUALIFICAÇÃO: MEDDIC');
    });
});
