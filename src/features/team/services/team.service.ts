import { randomBytes } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { prisma } from '../../../lib/prisma.js';
import { isAuthorizedLoginEmail } from '../../../config/access-policy.js';

const ROLE_HIERARCHY: Record<string, number> = {
    ADMIN: 100,
    GESTOR: 75,
    VENDEDOR: 50,
    VISUALIZADOR: 10,
};

export const ASSIGNABLE_ROLES = Object.keys(ROLE_HIERARCHY);

export class TeamServiceError extends Error {
    constructor(message: string, public statusCode: number = 400) {
        super(message);
    }
}

export interface TeamMember {
    id: string;
    name: string;
    email: string;
    role: string;
    mustChangePassword: boolean;
    createdAt: Date;
}

export async function listTeamMembers(organizationId: string): Promise<TeamMember[]> {
    return prisma.user.findMany({
        where: { organizationId },
        select: { id: true, name: true, email: true, role: true, mustChangePassword: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
    });
}

export interface AssignableOwner {
    id: string;
    name: string;
}

// Versão sem dados sensíveis (sem e-mail, papel, mustChangePassword) de listTeamMembers — usada
// pelo seletor de "responsável" em Leads/Activities, que qualquer usuário autenticado da
// organização precisa ver, não só ADMIN.
export async function listAssignableOwners(organizationId: string): Promise<AssignableOwner[]> {
    return prisma.user.findMany({
        where: { organizationId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
    });
}

function generateTempPassword(): string {
    // 12 caracteres alfanuméricos legíveis (sem 0/O/1/l pra evitar confusão ao digitar).
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const bytes = randomBytes(12);
    let pw = '';
    for (let i = 0; i < 12; i++) pw += alphabet[bytes[i] % alphabet.length];
    return `${pw}!A1`; // garante símbolo/maiúscula/dígito para qualquer política de senha
}

export async function createTeamMember(input: {
    organizationId: string;
    name: string;
    email: string;
    role: string;
}): Promise<{ member: TeamMember; tempPassword: string }> {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();

    if (!name) throw new TeamServiceError('Nome é obrigatório.');
    if (!isAuthorizedLoginEmail(email)) {
        throw new TeamServiceError('Use um e-mail corporativo autorizado (@atlasgr.com.br ou @totaltrac.com.br).');
    }
    if (!ASSIGNABLE_ROLES.includes(input.role)) {
        throw new TeamServiceError(`Papel inválido. Use um de: ${ASSIGNABLE_ROLES.join(', ')}.`);
    }

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
        throw new TeamServiceError('Já existe uma conta com esse e-mail.', 409);
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    const member = await prisma.user.create({
        data: {
            name,
            email,
            role: input.role,
            organizationId: input.organizationId,
            mustChangePassword: true,
            emailVerified: false,
            accounts: {
                create: {
                    id: crypto.randomUUID(),
                    accountId: email,
                    providerId: 'credential',
                    password: passwordHash,
                },
            },
        },
        select: { id: true, name: true, email: true, role: true, mustChangePassword: true, createdAt: true },
    });

    return { member, tempPassword };
}

export async function deleteTeamMember(organizationId: string, targetUserId: string, requestingUserId: string): Promise<void> {
    if (targetUserId === requestingUserId) {
        throw new TeamServiceError('Você não pode excluir sua própria conta por aqui.', 400);
    }

    const target = await prisma.user.findFirst({
        where: { id: targetUserId, organizationId },
        select: { id: true },
    });
    if (!target) {
        throw new TeamServiceError('Usuário não encontrado nesta organização.', 404);
    }

    // Session/Account têm onDelete: Cascade a partir de User — uma única exclusão basta.
    await prisma.user.delete({ where: { id: targetUserId } });
}
