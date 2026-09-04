import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../logger.js';

// Criptografia em repouso de credenciais de integrações persistidas no banco (bloqueador do
// AGENTS.md: "Credenciais armazenadas sem proteção adequada" — GoogleWorkspaceConnection.
// accessToken/refreshToken e BitrixConnection.webhookUrl eram gravados em texto puro, protegidos
// só por RLS de tenant, nunca por criptografia de campo própria; ver comentário que existia em
// prisma/schema.prisma sobre BitrixConnection.webhookUrl).
//
// AES-256-GCM: autenticado (detecta adulteração via authTag, não só criptografa), IV aleatório
// por valor (nunca reaproveitado com a mesma chave). Formato de armazenamento:
// "enc:v1:<iv base64>:<authTag base64>:<ciphertext base64>".
const ALGORITHM = 'aes-256-gcm';
const VERSION_PREFIX = 'enc:v1:';
const IV_LENGTH = 12; // tamanho de nonce recomendado para GCM

function resolveKey(): Buffer {
  const raw = env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) {
    if (env.NODE_ENV === 'production') {
      // Fail-closed: nunca inventa segredo padrão em produção (mesma regra que já vale para
      // BETTER_AUTH_SECRET — ver AGENTS.md "Autenticação").
      throw new Error(
        'CREDENTIALS_ENCRYPTION_KEY ausente em produção — obrigatória para cifrar credenciais de integrações (Bitrix/Google) em repouso. Gere uma com `openssl rand -base64 32`.',
      );
    }
    logger.warn(
      '[secretFields] CREDENTIALS_ENCRYPTION_KEY não configurada — usando chave fixa de desenvolvimento local. NUNCA use isso em produção (a trava acima impede a subida sem a variável real).',
    );
    // Chave fixa e conhecida, só para dev/test local — nunca alcançável em produção (guard acima).
    return createHash('sha256').update('insecure-dev-only-credentials-key').digest();
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `CREDENTIALS_ENCRYPTION_KEY inválida — esperado 32 bytes após decodificar base64, recebeu ${key.length}. Gere uma nova com \`openssl rand -base64 32\`.`,
    );
  }
  return key;
}

let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (!cachedKey) cachedKey = resolveKey();
  return cachedKey;
}

/** Exposto só para os testes poderem forçar a reavaliação da chave entre casos. */
export function _resetKeyCacheForTests(): void {
  cachedKey = null;
}

export function encryptField(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv, { authTagLength: 16 });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${VERSION_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptField(stored: string): string {
  if (!stored.startsWith(VERSION_PREFIX)) {
    // Valor legado, gravado antes desta criptografia existir (texto puro) — devolvido como
    // está. Não é o mesmo caso do catch abaixo: aqui o formato é reconhecidamente "sem
    // criptografia", não um "enc:v1:..." que falhou ao decifrar.
    return stored;
  }
  const parts = stored.slice(VERSION_PREFIX.length).split(':');
  if (parts.length === 3) {
    const [ivB64, authTagB64, ciphertextB64] = parts;
    try {
      const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'), {
        authTagLength: 16,
      });
      decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertextB64, 'base64')),
        decipher.final(),
      ]);
      return plaintext.toString('utf8');
    } catch {
      // cai para o throw comum abaixo
    }
  }
  // Fail-closed: nunca devolve a credencial corrompida/adulterada nem um valor vazio como se
  // fosse válido — quem chamar precisa tratar isso como conexão quebrada (ex.: pedir reconexão
  // da integração), nunca seguir adiante com um token errado.
  throw new Error('Falha ao decifrar credencial — chave incorreta ou dado corrompido/adulterado.');
}

/**
 * Marcador não-PII devolvido por `tryDecryptField` quando a descriptografia falha. Nunca é uma
 * string que passa por um regex de e-mail/telefone válido nem por igualdade com valor real —
 * intencional, para que o dado corrompido nunca seja confundido com PII legítima a jusante
 * (busca, dedup, envio de e-mail/WhatsApp).
 */
export const DECRYPTION_FAILED_MARKER = '⚠️ [dado ilegível — falha de descriptografia, ver logs]';

/**
 * Wrapper de `decryptField` que isola o dano por REGISTRO em vez de por QUERY inteira.
 * `decryptField` continua fail-closed sem nenhuma mudança (nunca aceita cifra inválida como
 * válida) — o problema real era o CHAMADOR: uma única linha com ciphertext indecifrável (chave
 * errada/dado corrompido) lançava e derrubava toda a extensão `$allOperations` do Prisma, o que
 * na prática apagava a listagem inteira de leads/contatos sempre que UM Contact relacionado
 * tivesse PII indecifrável (incidente real de produção, 01-03/09/2026 — decryptField chamado por
 * decryptNestedContactPii/decryptSensitiveResult, propagando para
 * PrismaLeadRepository.findAllWithFilters → LeadController.getLeads).
 *
 * Nunca loga o ciphertext nem a chave — só o contexto (model/campo/id) necessário para localizar
 * o registro afetado. Não é fail-open: o valor devolvido em falha é `DECRYPTION_FAILED_MARKER`,
 * nunca o ciphertext cru nem um texto vazio que pareça válido.
 */
export function tryDecryptField(
  stored: string,
  context: { model: string; field: string; id?: string },
): string {
  try {
    return decryptField(stored);
  } catch {
    logger.error(
      { model: context.model, field: context.field, recordId: context.id },
      '[secretFields] Falha ao decifrar campo — isolado a este registro, query não foi derrubada. Verifique CREDENTIALS_ENCRYPTION_KEY/rotação de chave.',
    );
    return DECRYPTION_FAILED_MARKER;
  }
}
