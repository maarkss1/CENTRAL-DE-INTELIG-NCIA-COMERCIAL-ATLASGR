import { encryptField, decryptField } from './secretFields.js';

// Criptografia de campos sensíveis (credenciais de integração) em repouso — mesmo mecanismo
// AES-256-GCM de secretFields.ts, aplicado de forma transparente pela extensão do Prisma Client em
// src/lib/prisma.ts ($allOperations). Esta config foi extraída para um módulo próprio, sem nenhuma
// dependência de `@prisma/client`/`pg`, justamente para poder ser testada em unidade sem precisar
// importar prisma.ts inteiro (que cria um `Pool` do `pg` no top-level do módulo e falharia/
// travaria em ambiente sem Postgres real).
//
// REVERTIDO nesta mesma rodada — `Contact: ['name','phone','whatsapp','email','linkedin',
// 'observations']` chegou a ser adicionado aqui (CPI — item "PII de lead/contato não cifrada em
// repouso") e passou em unit test (que não usa Postgres real), mas o gate de CI com Postgres real
// revelou quebra confirmada, não só teórica, em pelo menos 4 fluxos de produção que fazem WHERE ou
// leitura aninhada sobre essas colunas — o mesmo texto puro nunca produz o mesmo ciphertext duas
// vezes (IV aleatório por valor), então qualquer igualdade/contains no SQL para de casar:
//   - `tests/integration/emailReplyTracking.test.ts` (CYC-003): resolve o lead pelo e-mail do
//     contato (`where: { contact: { email } }`) — parou de encontrar o lead.
//   - `tests/integration/whatsapp-optout-gating.test.ts`: casa opt-out por telefone/e-mail do
//     contato — parou de casar.
//   - `tests/integration/document-signature.routes.test.ts`: lê o e-mail do contato vinculado por
//     um `include`/`select` aninhado a partir de outro model — a extensão do Prisma só decifra no
//     nível do model da própria operação (`ENCRYPTED_FIELDS[model]` em `prisma.ts`), não em
//     relações incluídas, então o e-mail volta como ciphertext cru para quem espera texto puro.
//   - `tests/integration/auto-anonymize-sweep-idempotency.test.ts`: contagem/filtro afetados pelo
//     mesmo problema de igualdade sobre coluna cifrada.
// Cifrar PII de Contact em repouso continua sendo um gap real (ver auditoria do checklist CPI),
// mas exige, antes de reativar, uma solução de busca compatível com ciphertext não-determinístico
// (ex.: índice HMAC-SHA256 separado para igualdade exata, ou aceitar formalmente a perda de busca/
// dedup por esses campos) — decisão de produto/arquitetura, não resolvida aqui. Ver
// `.agents/handoffs/onda-39/01-para-00-pii-contact-revertida-quebra-integration.md`.
export const ENCRYPTED_MODEL_FIELDS: Record<string, readonly string[]> = {
  GoogleWorkspaceConnection: ['accessToken', 'refreshToken'],
  BitrixConnection: ['webhookUrl', 'webhookSecret'],
  // Credencial de PABX 3CX (Call Control API) — mesmo tratamento das duas linhas acima. Ver
  // .agents/handoffs/onda-5/01-para-06-persistencia-3cx-implementada.md.
  ThreeCXConnection: ['apiKey', 'apiSecret'],
  // Tokens OAuth de login social (Google/Microsoft via Better Auth, gravados por
  // prismaAdapter em src/lib/auth.ts) — mesma classe de credencial de terceiro das linhas
  // acima. Ver .agents/handoffs/roadmap-v2-onda-1/01-para-00-account-oauth-tokens-sem-cifra.md.
  Account: ['accessToken', 'refreshToken', 'idToken'],
};

export function encryptSensitiveFields(
  model: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const fields = ENCRYPTED_MODEL_FIELDS[model];
  if (!fields) return data;
  const out = { ...data };
  for (const field of fields) {
    if (typeof out[field] === 'string' && out[field]) {
      out[field] = encryptField(out[field] as string);
    }
  }
  return out;
}

export function decryptSensitiveRecord<T>(model: string, record: T): T {
  const fields = ENCRYPTED_MODEL_FIELDS[model];
  if (!fields || !record || typeof record !== 'object') return record;
  const out = record as Record<string, unknown>;
  for (const field of fields) {
    if (typeof out[field] === 'string' && out[field]) {
      out[field] = decryptField(out[field] as string);
    }
  }
  return out as T;
}

export function decryptSensitiveResult<T>(model: string, result: T): T {
  if (!ENCRYPTED_MODEL_FIELDS[model] || !result) return result;
  if (Array.isArray(result)) {
    return result.map((item) => decryptSensitiveRecord(model, item)) as unknown as T;
  }
  return decryptSensitiveRecord(model, result);
}
