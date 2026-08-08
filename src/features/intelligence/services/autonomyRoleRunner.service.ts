import { BDRAgent } from '../agents/bdr.agent.js';
import { CloserAgent } from '../agents/closer.agent.js';
import { CRMAgent } from '../agents/crm.agent.js';

export type AutonomyRole = 'BDR' | 'CLOSER' | 'CRM';

/**
 * Executa somente a camada analítica do especialista. O scheduler 24/7 não usa o grafo com tools
 * mutáveis (SDR/Ops), evitando que uma simples análise grave status ou tarefas antes da política
 * decidir o que pode ser autoexecutado. Ações externas seguem pelo ledger AIPendingAction.
 */
export async function runAutonomyRole(
    role: AutonomyRole,
    context: string,
    sessionId: string,
): Promise<string> {
    if (role === 'BDR') {
        const result = await new BDRAgent().run(context, sessionId);
        if (result.error) throw new Error(result.error);
        return result.qualification || 'BDR concluiu a análise sem detalhamento textual.';
    }

    if (role === 'CLOSER') {
        const result = await new CloserAgent().run(context, sessionId);
        if (result.error) throw new Error(result.error);
        return result.closePlan || 'Closer concluiu a análise sem detalhamento textual.';
    }

    const result = await new CRMAgent().run(context, sessionId);
    if (result.error) throw new Error(result.error);
    return result.action || 'CRM concluiu a análise sem detalhamento textual.';
}
