import { prisma } from '../../../../lib/prisma.js';
import type { BitrixUserOption } from './deals.js';

/**
 * Ponte Usuário-Atlas ↔ Usuário-Bitrix — deliberadamente SEM coluna nova no schema (Integrações
 * não cria migração própria, ver AGENTS.md raiz: "prisma/schema.prisma: somente Agente 01"). O
 * casamento é feito em tempo de requisição, por e-mail: assume que a pessoa usa o mesmo e-mail
 * corporativo nos dois sistemas — mesma premissa que já vale hoje para o convite de equipe
 * (`team.service.ts`). Sem correspondência, as funções abaixo devolvem `null` — nunca inventam um
 * vínculo. Recebe a lista de usuários do Bitrix já buscada pelo chamador (em vez de buscar aqui)
 * de propósito — `deals.ts` é quem expõe `getBitrixUsers`, e este arquivo é importado por
 * `deals.ts`/`leads.ts` para a checagem de dono no import; buscar aqui de volta criaria um ciclo
 * de import entre os dois módulos.
 */

/** Devolve o ASSIGNED_BY_ID (Bitrix) do usuário logado neste portal, ou `null` se o e-mail dele não bater com nenhum usuário do Bitrix. */
export function resolveOwnBitrixUserId(bitrixUsers: BitrixUserOption[], userEmail: string): string | null {
    const normalized = userEmail.trim().toLowerCase();
    return bitrixUsers.find((u) => u.email === normalized)?.id ?? null;
}

/**
 * Devolve o nome (User.name) do usuário Atlas desta organização cujo e-mail bate com o
 * `bitrixEmail` informado. `null` quando não há usuário Atlas com esse e-mail (nunca fabrica um
 * nome).
 *
 * NÃO use esta função para preencher `Lead.owner` — use `resolveAtlasUserIdByEmail` abaixo.
 * `Lead.owner` precisa sempre gravar `User.id`, a mesma convenção usada por leads criados dentro
 * do app (`LeadUseCases.createLead`, `assignment.service.ts`); gravar o nome aqui é o que quebrava
 * `requireLeadOwnership` (RBAC) e duplicava vendedores no ranking de BI por owner — ver
 * `.agents/handoffs/onda-7/04-para-06-owner-bitrix-nome-nao-id.md`. Esta função continua existindo
 * porque é reexportada como parte da API pública deste módulo (`bitrix.service.ts`) e pode ter
 * consumidores futuros que precisem do nome para exibição — não porque ainda alimenta `Lead.owner`.
 */
export async function resolveAtlasUserNameByEmail(organizationId: string, bitrixEmail: string | null): Promise<string | null> {
    if (!bitrixEmail) return null;
    const user = await prisma.user.findFirst({
        where: { organizationId, email: { equals: bitrixEmail, mode: 'insensitive' } },
        select: { name: true },
    });
    return user?.name ?? null;
}

/**
 * Devolve o `User.id` do usuário Atlas desta organização cujo e-mail bate com o `bitrixEmail`
 * informado — use esta função (não `resolveAtlasUserNameByEmail`) para preencher `Lead.owner` no
 * import a partir de quem está marcado como responsável (ASSIGNED_BY_ID) no Bitrix, para manter a
 * mesma convenção usada por leads criados dentro do app. `null` quando não há usuário Atlas com
 * esse e-mail (o registro ainda é importado, só fica sem responsável — nunca fabrica um vínculo).
 */
export async function resolveAtlasUserIdByEmail(organizationId: string, bitrixEmail: string | null): Promise<string | null> {
    if (!bitrixEmail) return null;
    const user = await prisma.user.findFirst({
        where: { organizationId, email: { equals: bitrixEmail, mode: 'insensitive' } },
        select: { id: true },
    });
    return user?.id ?? null;
}
