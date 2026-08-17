import { AppError } from '../../../shared/middlewares/errorHandler';

/**
 * `Activity.owner` é texto livre (não FK para `User`) de propósito — o formulário humano
 * (`ActivityList.tsx`) deixa digitar qualquer responsável, e isso é legítimo. O que não é
 * legítimo é um nome fabricado usado como substituto de "sem responsável real conhecido" — ver
 * AGENTS.md > "Dados reais x demonstração" ("nenhuma métrica comercial pode ser fabricada para
 * preencher a interface") e a mission do Agente 04 ("não usar... fallback que mascara ausência de
 * owner"). Já foi encontrado pelo menos um chamador fazendo isso (ferramenta de IA em
 * `src/features/intelligence/tools/opsTools.ts`, que cria uma tarefa PARA UM CLOSER/SDR HUMANO
 * executar depois, mas atribui o dono como 'Enxame de IA Atlas' quando nenhum owner é informado —
 * ver `.agents/handoffs/onda-7/04-para-07-owner-fabricado-follow-up-ia.md`). Esta lista bloqueia
 * esses valores na origem, para qualquer chamador presente ou futuro (usado tanto pela camada
 * legada `activity.service.ts` quanto pela `ActivityUseCases` que a rota `/api/activities`
 * realmente usa — ver DI em `shared/di/setup.ts` — para não deixar a checagem valendo só num dos
 * dois caminhos).
 */
const FORBIDDEN_PLACEHOLDER_OWNERS = new Set([
    'enxame de ia atlas',
    'enxame de ia atlasgr',
    'vendedor 1',
    'vendedor padrão',
    'vendedor genérico',
]);

export function assertRealOwner(owner: string): void {
    if (FORBIDDEN_PLACEHOLDER_OWNERS.has(owner.trim().toLowerCase())) {
        throw new AppError(
            `"${owner}" não é um responsável real — informe a pessoa de fato responsável por esta atividade, sem usar um nome de preenchimento.`,
            422,
        );
    }
}
