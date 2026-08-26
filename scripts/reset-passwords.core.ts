import { randomUUID, randomBytes } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { prisma } from '../src/lib/prisma.js';
import { requestContext } from '../src/lib/async-context.js';
import { resolveScriptActor, logAuditEvent } from './lib/script-audit.js';

// ITEM-03 (remediação de dívida técnica) endureceu este script. Resumo do que mudou e por quê:
//
// 1. Sem senha default previsível: a versão anterior caía para a constante fixa '00000000'
//    quando nenhuma senha era passada — qualquer pessoa que lesse o código (ou o histórico do
//    repositório) sabia a senha resultante de rodar o script sem argumento extra. Agora, sem uma
//    senha explícita, o script GERA uma senha aleatória criptograficamente forte por execução.
// 2. Senha nunca passada por argumento de linha de comando: argumentos de CLI ficam no histórico
//    do shell e em `ps`/listagens de processo enquanto o script roda — visíveis a qualquer outro
//    processo/usuário da mesma máquina. Quem precisa fornecer uma senha específica (em vez de
//    gerada) usa a variável de ambiente RESET_PASSWORD_VALUE.
// 3. Senha nunca impressa em stdout/stderr: a versão anterior logava
//    `Password reset to ${password} ...` para cada usuário — texto puro sobrevivendo em
//    histórico de terminal, logs de CI e qualquer agregador de log. A trilha de auditoria abaixo
//    registra quem/quando/escopo/resultado, nunca a senha nem o hash.
// 4. `--all` exige DOIS fatores explícitos agora (a flag de confirmação E uma variável de
//    ambiente dedicada) — o mesmo padrão de defesa em profundidade já usado em
//    scripts/emergency-reset-all-passwords.ts para a mesma classe de operação.
//
// Uso:
//   tsx scripts/reset-passwords.ts <email>
//   tsx scripts/reset-passwords.ts --all --yes-reset-all-users   (exige também
//     RESET_PASSWORDS_ALLOW_ALL=1 no ambiente)
//
// Variáveis de ambiente opcionais:
//   RESET_PASSWORD_VALUE   senha específica a aplicar (mín. 12 caracteres). Sem ela, uma senha
//                          aleatória forte é gerada e NUNCA é impressa — comunique-a ao usuário
//                          por um canal fora deste script (a saída aqui só confirma o resultado).
//   RESET_PASSWORDS_ACTOR  identifica quem está rodando o script na trilha de auditoria. Sem ela,
//                          cai para o usuário do sistema operacional.

export const ALL_CONFIRMATION_FLAG = '--yes-reset-all-users';
const MIN_SUPPLIED_PASSWORD_LENGTH = 12;
const GENERATED_PASSWORD_LENGTH = 16;

export class ResetPasswordsUsageError extends Error {}

export interface ResetPasswordsOutcome {
  scope: 'single' | 'all';
  target: string | null;
  usersFound: number;
  usersUpdated: number;
  actor: string;
  passwordSource: 'env' | 'generated';
  startedAt: string;
  finishedAt: string;
}

/**
 * 16 caracteres alfanuméricos (sem 0/O/1/l, mesmo alfabeto de
 * src/features/team/services/team.service.ts::generateTempPassword) mais um sufixo fixo que
 * garante símbolo/maiúscula/dígito para qualquer política de senha — gerados a partir de
 * `crypto.randomBytes`, não `Math.random()`.
 */
function generateStrongPassword(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(GENERATED_PASSWORD_LENGTH);
  let pw = '';
  for (let i = 0; i < GENERATED_PASSWORD_LENGTH; i++) pw += alphabet[bytes[i] % alphabet.length];
  return `${pw}!A1`;
}

function resolvePassword(): { password: string; source: 'env' | 'generated' } {
  const fromEnv = process.env.RESET_PASSWORD_VALUE?.trim();
  if (fromEnv) {
    if (fromEnv.length < MIN_SUPPLIED_PASSWORD_LENGTH) {
      throw new ResetPasswordsUsageError(
        `RESET_PASSWORD_VALUE deve ter pelo menos ${MIN_SUPPLIED_PASSWORD_LENGTH} caracteres.`,
      );
    }
    return { password: fromEnv, source: 'env' };
  }
  return { password: generateStrongPassword(), source: 'generated' };
}

export async function resetPasswords(argv: string[]): Promise<ResetPasswordsOutcome> {
  const targetArg = argv[0]?.trim();

  // Alvo explícito obrigatório: rodar sem argumento nunca reseta ninguém — destrutivo demais
  // para acontecer por engano. Para atingir todo mundo, a intenção precisa ser literal e dupla
  // (ver checagem de --all abaixo).
  if (!targetArg) {
    throw new ResetPasswordsUsageError(
      'Uso: tsx scripts/reset-passwords.ts <email>\n' +
        `       tsx scripts/reset-passwords.ts --all ${ALL_CONFIRMATION_FLAG}  (requer também RESET_PASSWORDS_ALLOW_ALL=1)\n` +
        'Sem alvo explícito nada é alterado.',
    );
  }

  const resetAll = targetArg === '--all';
  const targetEmail = resetAll ? undefined : targetArg.toLowerCase();

  if (resetAll) {
    // Fator 1: flag de confirmação literal como segundo argumento.
    if (argv[1] !== ALL_CONFIRMATION_FLAG) {
      throw new ResetPasswordsUsageError(
        `Reset de TODOS os usuários exige a flag de confirmação explícita: tsx scripts/reset-passwords.ts --all ${ALL_CONFIRMATION_FLAG}`,
      );
    }
    // Fator 2: variável de ambiente dedicada, independente da flag — evita que um alias/script
    // de terceiros que sempre passa a flag torne o reset em massa "automático".
    if (process.env.RESET_PASSWORDS_ALLOW_ALL !== '1') {
      throw new ResetPasswordsUsageError(
        'Reset de TODOS os usuários também exige a variável de ambiente RESET_PASSWORDS_ALLOW_ALL=1 definida explicitamente nesta execução.',
      );
    }
  }

  const { password, source: passwordSource } = resolvePassword();
  const startedAt = new Date().toISOString();
  const actor = resolveScriptActor('RESET_PASSWORDS_ACTOR');

  requestContext.enterWith({ bypassRls: true });

  const users = await prisma.user.findMany({
    where: targetEmail ? { email: targetEmail } : undefined,
    select: { id: true, email: true },
  });

  if (users.length === 0) {
    const finishedAt = new Date().toISOString();
    logAuditEvent({
      event: 'reset_passwords',
      actor,
      scope: resetAll ? 'all' : 'single',
      target: targetEmail ?? 'ALL',
      usersFound: 0,
      usersUpdated: 0,
      result: 'no_user_found',
      startedAt,
      finishedAt,
    });
    return {
      scope: resetAll ? 'all' : 'single',
      target: targetEmail ?? null,
      usersFound: 0,
      usersUpdated: 0,
      actor,
      passwordSource,
      startedAt,
      finishedAt,
    };
  }

  const passwordHash = await hashPassword(password);

  for (const user of users) {
    // Busca por userId+providerId em vez de upsert por um id adivinhado (`${user.id}:credential`):
    // o Better Auth gera um id aleatório para a conta na criação (ver seed_users.ts), então o
    // upsert antigo nunca batia com a linha existente e criava uma SEGUNDA conta de credencial
    // duplicada — o login passava a depender de qual das duas o Better Auth escolhesse
    // (`user.accounts.find(a => a.providerId === 'credential')`, não-determinístico), deixando a
    // senha "resetada" aqui sem efeito real na prática.
    const existingAccount = await prisma.account.findFirst({
      where: { userId: user.id, providerId: 'credential' },
      select: { id: true },
    });

    if (existingAccount) {
      await prisma.account.update({
        where: { id: existingAccount.id },
        data: { password: passwordHash },
      });
    } else {
      await prisma.account.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          accountId: user.id,
          providerId: 'credential',
          password: passwordHash,
        },
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { mustChangePassword: true },
    });
  }

  const finishedAt = new Date().toISOString();

  // Trilha de auditoria: quem executou, quando, escopo e resultado — nunca a senha nem o hash.
  logAuditEvent({
    event: 'reset_passwords',
    actor,
    scope: resetAll ? 'all' : 'single',
    target: targetEmail ?? 'ALL',
    usersFound: users.length,
    usersUpdated: users.length,
    passwordSource,
    result: 'reset',
    startedAt,
    finishedAt,
  });

  return {
    scope: resetAll ? 'all' : 'single',
    target: targetEmail ?? null,
    usersFound: users.length,
    usersUpdated: users.length,
    actor,
    passwordSource,
    startedAt,
    finishedAt,
  };
}
