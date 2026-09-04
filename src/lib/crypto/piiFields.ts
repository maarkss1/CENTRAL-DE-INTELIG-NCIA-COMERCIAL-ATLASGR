import { encryptField, tryDecryptField } from './secretFields.js';

// Criptografia de campos sensíveis (credenciais de integração + PII de contato) em repouso — mesmo mecanismo
// AES-256-GCM de secretFields.ts, aplicado de forma transparente pela extensão do Prisma Client em
// src/lib/prisma.ts ($allOperations). Esta config foi extraída para um módulo próprio, sem nenhuma
// dependência de `@prisma/client`/`pg`, justamente para poder ser testada em unidade sem precisar
// importar prisma.ts inteiro (que cria um `Pool` do `pg` no top-level do módulo e falharia/
// travaria em ambiente sem Postgres real).
//
// `Contact: ['email', 'phone', 'whatsapp']` REATIVADO — havia sido revertido numa rodada anterior
// (`.agents/handoffs/onda-39/01-para-00-pii-contact-revertida-quebra-integration.md`) por quebrar
// WHERE de igualdade/contains e leitura aninhada sobre essas colunas: o mesmo texto puro nunca
// produz o mesmo ciphertext duas vezes (IV aleatório por valor), então igualdade/contains no SQL
// param de casar. Desta vez os dois problemas foram resolvidos, não contornados:
//   1. Índice cego determinístico (HMAC-SHA256, `src/lib/crypto/piiIndex.ts`) em colunas próprias
//      (`Contact.emailIndex`/`emailDomainIndex`/`phoneIndex`/`phoneLast8Index`/`whatsappIndex`/
//      `whatsappLast8Index`) — todo WHERE de igualdade/sufixo que antes comparava o campo cifrado
//      diretamente foi reescrito para comparar o índice correspondente (ver
//      `emailReply.webhook.ts`, `ownershipGuard.ts`, `voiceResult.webhook.ts`,
//      `threecx.service.ts`, `PrismaCadenceRateLimitPort.ts`, `deduplication.worker.ts`).
//   2. Leitura aninhada (`include`/`select` a partir de outro model, ex.: `Lead.contact`) — a
//      extensão do Prisma agora também decifra recursivamente qualquer `email`/`phone`/`whatsapp`
//      no formato `enc:v1:...` em qualquer profundidade do resultado (`decryptNestedContactPii`
//      em `prisma.ts`), não só no nível do model da própria operação.
// `name`/`linkedin`/`observations`/`role`/`department` CONTINUAM em texto puro — de propósito:
// sustentam a busca livre por substring de `ContactService.findAll` (`contains`), que um índice de
// igualdade não substitui sem trocar de técnica (full-text externo). Gap documentado, não
// silenciosamente descartado — ver comentário em `piiIndex.ts`.
//
// Dados existentes (gravados antes desta mudança) precisam do backfill em
// `scripts/security/backfill-contact-pii.ts` — sem rodá-lo, contatos antigos ficam sem os índices
// e não são encontrados pelas buscas exatas acima até a próxima escrita (a leitura continua
// funcionando: `decryptField` trata texto legado sem o prefixo `enc:v1:` como passthrough).
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
  // PII direta de contato — ver comentário grande acima.
  Contact: ['email', 'phone', 'whatsapp'],
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
  const id = typeof out.id === 'string' ? out.id : undefined;
  for (const field of fields) {
    if (typeof out[field] === 'string' && out[field]) {
      // tryDecryptField isola a falha a ESTE campo/registro — uma única credencial indecifrável
      // não deve mais derrubar a query inteira (ver comentário em secretFields.ts).
      out[field] = tryDecryptField(out[field] as string, { model, field, id });
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
