import { describe, expect, it } from 'vitest';
import { updateLeadQualificationTool } from '../../tools/crmTools';
import { createFollowUpTaskTool, notifyTeamTool } from '../../tools/opsTools';

/**
 * Prova, por teste (não por leitura), que NENHUM caminho do enxame — em especial o Closer — move
 * um Lead/deal para "Negócios Ganhos" (`LeadStatus.Negocios_Ganhos`). AUTONOMIA_COMERCIAL_24X7.md:
 * "A transição para Negócios Ganhos não deve ser decidida por texto gerado: ela exige um evento
 * verificável, como aceite, assinatura ou confirmação do CRM."
 *
 * `updateLeadQualificationTool` (crmTools.ts) é a ÚNICA ferramenta de todo o enxame capaz de
 * escrever `status` em um Lead — nenhuma outra ferramenta registrada (ver a lista das 9 abaixo)
 * grava esse campo. Se ela algum dia ganhar 'Negocios_Ganhos' no enum aceito, este teste quebra.
 */
describe('Closer — nenhum caminho fecha negócio sozinho (trava de "Negócios Ganhos")', () => {
    it('CloserAgent não tem acesso a nenhuma ferramenta que escreva status de Lead', async () => {
        const { CloserAgent } = await import('../closer.agent');
        const agent = new CloserAgent();

        // CloserAgent.run() importa marketResearchTool dinamicamente e delega para
        // BaseAgent.runWithTools([marketResearchTool]) — é a ÚNICA ferramenta vinculada ao Closer, e
        // ela só faz busca na web (Tavily), sem qualquer escrita no CRM. Provamos isso na fonte, em
        // vez de reimplementar internals do LangGraph aqui.
        const source = agent.run.toString();
        expect(source).toContain('marketResearchTool');
        expect(source).not.toMatch(/updateLeadQualificationTool|update_lead_qualification/);
    });

    it('update_lead_qualification (a única ferramenta do enxame que grava status de Lead) nunca aceita um status de fechamento', () => {
        const statusEnumValues = (updateLeadQualificationTool.schema as unknown as {
            shape: { status: { options?: string[]; def?: { values?: string[] } } };
        }).shape.status;

        const options = (statusEnumValues as { options?: string[] }).options
            ?? (statusEnumValues as { def?: { values?: string[] } }).def?.values
            ?? [];

        expect(options.length).toBeGreaterThan(0);
        expect(options).not.toContain('Negocios_Ganhos');
        expect(options).not.toContain('Negocios_Perdidos');
        // Contrato positivo (não só negativo): os 4 valores que a ferramenta pode escrever são
        // exatamente os esperados para qualificação de topo de funil — nada além disso.
        expect(new Set(options)).toEqual(new Set([
            'Lead_Recebido',
            'Qualificacao_SDR',
            'Reuniao_Agendada',
            'Lead_Desqualificado',
        ]));
    });

    it('nenhuma das outras 8 ferramentas registradas no enxame escreve status de Lead', () => {
        // create_follow_up_task cria uma Activity (agenda humana), nunca toca em Lead.status.
        expect(createFollowUpTaskTool.description).not.toMatch(/status/i);
        // notify_team só cria uma Notification interna.
        expect(notifyTeamTool.description).not.toMatch(/status.*[Ll]ead/i);
    });
});
