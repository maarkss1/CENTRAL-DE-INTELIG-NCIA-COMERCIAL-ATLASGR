import { prisma } from '../src/lib/prisma.js';
import { requestContext } from '../src/lib/async-context.js';
import { resolveScriptActor, logAuditEvent } from './lib/script-audit.js';

// ITEM-03 (remediação de dívida técnica): a versão anterior deste script rodava
// `prisma.user.updateMany({ data: { role: 'ADMIN' } })` SEM `where` — ou seja, `tsx
// scripts/set-admin.ts`, sem nenhum argumento, promovia TODOS os usuários da base a ADMIN de uma
// vez, sem alvo explícito, sem confirmação e sem trilha de auditoria. É a mesma classe de risco
// do reset de senha em massa, mas sem sequer a barreira mínima que reset-passwords.ts já tinha
// (exigir `--all` explícito). Não há caso de uso legítimo documentado para promoção em massa
// neste projeto, então a capacidade foi removida — este script agora só promove um único usuário
// existente, indicado por e-mail.
//
// Uso: tsx scripts/set-admin.ts <email>

export class SetAdminUsageError extends Error {}

export interface SetAdminOutcome {
  target: string;
  usersFound: number;
  usersUpdated: number;
  actor: string;
  startedAt: string;
  finishedAt: string;
}

export async function setAdmin(argv: string[]): Promise<SetAdminOutcome> {
  const targetArg = argv[0]?.trim();

  if (!targetArg) {
    throw new SetAdminUsageError(
      'Uso: tsx scripts/set-admin.ts <email>\n' +
        'Promove um único usuário existente a ADMIN. Sem alvo explícito nada é alterado.',
    );
  }

  const targetEmail = targetArg.toLowerCase();
  const startedAt = new Date().toISOString();
  const actor = resolveScriptActor('SET_ADMIN_ACTOR');

  requestContext.enterWith({ bypassRls: true });

  const user = await prisma.user.findUnique({
    where: { email: targetEmail },
    select: { id: true, role: true },
  });

  if (!user) {
    const finishedAt = new Date().toISOString();
    logAuditEvent({
      event: 'set_admin',
      actor,
      target: targetEmail,
      usersFound: 0,
      usersUpdated: 0,
      result: 'no_user_found',
      startedAt,
      finishedAt,
    });
    return { target: targetEmail, usersFound: 0, usersUpdated: 0, actor, startedAt, finishedAt };
  }

  const previousRole = user.role;

  await prisma.user.update({
    where: { id: user.id },
    data: { role: 'ADMIN' },
  });

  const finishedAt = new Date().toISOString();
  logAuditEvent({
    event: 'set_admin',
    actor,
    target: targetEmail,
    previousRole,
    usersFound: 1,
    usersUpdated: 1,
    result: 'promoted',
    startedAt,
    finishedAt,
  });

  return { target: targetEmail, usersFound: 1, usersUpdated: 1, actor, startedAt, finishedAt };
}
