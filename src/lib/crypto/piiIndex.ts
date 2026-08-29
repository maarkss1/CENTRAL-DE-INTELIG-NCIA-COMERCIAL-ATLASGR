import { createHmac, createHash } from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../logger.js';

// Índice cego (blind index) para permitir busca exata sobre PII de Contact cifrada em repouso
// (ver src/lib/crypto/piiFields.ts e src/lib/crypto/secretFields.ts) sem expor o texto puro.
//
// `secretFields.ts` cifra email/telefone/whatsapp com AES-256-GCM e IV aleatório por valor — por
// desenho, o mesmo texto puro nunca produz o mesmo ciphertext duas vezes, então nenhum WHERE de
// igualdade ou GROUP BY contra a coluna cifrada pode funcionar. Este módulo resolve isso com um
// HMAC-SHA256 DETERMINÍSTICO (mesma entrada → mesma saída) do valor normalizado, guardado numa
// coluna separada (`Contact.emailIndex`/`phoneIndex`/`whatsappIndex`/...) — comparável por
// igualdade, mas que não permite recuperar o texto original sem a chave secreta (ao contrário de
// um hash público tipo SHA-256 puro, que qualquer um poderia forçar por dicionário).
//
// Reativa o gap documentado em `.agents/handoffs/onda-39/01-para-00-pii-contact-revertida-quebra-integration.md`
// (cifra de Contact.email/phone/whatsapp foi revertida por quebrar 4 fluxos reais de busca exata/
// sufixo) usando exatamente o caminho 1 sugerido lá: "índice determinístico separado (ex.:
// HMAC-SHA256 de um valor normalizado) para permitir igualdade exata sem expor o texto puro".
//
// Escopo deliberadamente limitado a email/phone/whatsapp — os três campos que toda a auditoria de
// PII aponta como identificadores diretos e que têm hoje busca exata/sufixo mapeada e substituível
// por um índice de igualdade. `name`/`linkedin`/`observations`/`role`/`department` continuam em
// texto puro: são a base da busca livre por substring da tela de Contatos
// (`ContactService.findAll`, `contains`), que um índice de igualdade não consegue substituir sem
// trocar de técnica (ex.: busca full-text externa) — fora do escopo desta rodada, gap continua
// documentado, não descartado silenciosamente.
const ALGORITHM = 'sha256';

function resolveIndexKey(): Buffer {
  const raw = env.PII_BLIND_INDEX_KEY;
  if (!raw) {
    if (env.NODE_ENV === 'production') {
      // Fail-closed, mesma regra de CREDENTIALS_ENCRYPTION_KEY/BETTER_AUTH_SECRET: nunca inventa
      // uma chave padrão em produção — sem ela, todo o índice de busca exata de Contact fica
      // inoperante (silenciosamente devolveria 0 resultados em vez de vazar dado).
      throw new Error(
        'PII_BLIND_INDEX_KEY ausente em produção — obrigatória para o índice de busca exata de PII de Contact (e-mail/telefone/whatsapp) cifrada em repouso. Gere uma com `openssl rand -base64 32`.',
      );
    }
    logger.warn(
      '[piiIndex] PII_BLIND_INDEX_KEY não configurada — usando chave fixa de desenvolvimento local. NUNCA use isso em produção (a trava acima impede a subida sem a variável real).',
    );
    return createHash('sha256').update('insecure-dev-only-pii-index-key').digest();
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `PII_BLIND_INDEX_KEY inválida — esperado 32 bytes após decodificar base64, recebeu ${key.length}. Gere uma nova com \`openssl rand -base64 32\`.`,
    );
  }
  return key;
}

let cachedKey: Buffer | null = null;
function getIndexKey(): Buffer {
  if (!cachedKey) cachedKey = resolveIndexKey();
  return cachedKey;
}

/** Exposto só para os testes poderem forçar a reavaliação da chave entre casos. */
export function _resetIndexKeyCacheForTests(): void {
  cachedKey = null;
}

function hmac(normalized: string): string {
  return createHmac(ALGORITHM, getIndexKey()).update(normalized).digest('hex');
}

/** E-mail normalizado (trim + lowercase) — mesma tolerância que `mode: 'insensitive'` já dava em
 * todo WHERE de igualdade por e-mail antes deste índice existir (ver call sites atualizados). */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Domínio (parte após `@`) normalizado — usado por matching de "mesmo domínio de e-mail" que
 * antes era um `endsWith('@dominio')`, não uma igualdade exata de e-mail inteiro. */
function emailDomainOf(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at === -1 || at === email.length - 1) return null;
  return email
    .slice(at + 1)
    .trim()
    .toLowerCase();
}

/**
 * Só dígitos, últimos `n` — replica exatamente o `LIKE '%' + significant` (sufixo, com `n`
 * variável) que existia antes deste índice: quando o valor tem menos de `n` dígitos, usa TODOS os
 * dígitos disponíveis (nunca menos), o mesmo corte que cada call site já fazia manualmente antes
 * (`digits.length >= n ? digits.slice(-n) : digits`). Dois `n` diferentes convivem de propósito —
 * 8 (webhooks de voz Bland AI/3CX) e 9 (mensagens de WhatsApp recebidas, `whatsappMessage.
 * service.ts`) — cada um replicando o comportamento pré-existente do respectivo call site, não um
 * valor novo escolhido aqui.
 */
function lastNDigits(value: string, n: number): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return null;
  return digits.length >= n ? digits.slice(-n) : digits;
}

export function contactEmailIndex(email: string | null | undefined): string | null {
  if (!email) return null;
  return hmac(normalizeEmail(email));
}

export function contactEmailDomainIndex(email: string | null | undefined): string | null {
  if (!email) return null;
  const domain = emailDomainOf(email);
  return domain ? hmac(domain) : null;
}

/** Mesmo índice de `contactEmailDomainIndex`, mas a partir de um domínio já isolado (sem `@`) em
 * vez de um e-mail completo — usado por quem já recebe só o domínio (ex.:
 * `PrismaCadenceRateLimitPort.countDistinctEmailRecipientsForDomain`). */
export function emailDomainIndexOf(domain: string | null | undefined): string | null {
  if (!domain) return null;
  return hmac(domain.trim().toLowerCase());
}

/** Índice de igualdade EXATA sobre o telefone/whatsapp exatamente como armazenado (sem
 * normalizar dígitos) — replica bit a bit o `{ phone: contact.phone }` de igualdade de string
 * crua que já existia antes deste índice (ver ownershipGuard.ts), sem mudar semântica de
 * matching. */
export function contactPhoneIndex(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return hmac(phone);
}

export function contactWhatsappIndex(whatsapp: string | null | undefined): string | null {
  if (!whatsapp) return null;
  return hmac(whatsapp);
}

export function contactPhoneLast8Index(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const last8 = lastNDigits(phone, 8);
  return last8 ? hmac(last8) : null;
}

export function contactWhatsappLast8Index(whatsapp: string | null | undefined): string | null {
  if (!whatsapp) return null;
  const last8 = lastNDigits(whatsapp, 8);
  return last8 ? hmac(last8) : null;
}

export function contactPhoneLast9Index(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const last9 = lastNDigits(phone, 9);
  return last9 ? hmac(last9) : null;
}

export function contactWhatsappLast9Index(whatsapp: string | null | undefined): string | null {
  if (!whatsapp) return null;
  const last9 = lastNDigits(whatsapp, 9);
  return last9 ? hmac(last9) : null;
}

/** Índice de igualdade sobre um número de telefone bruto (ex.: `to`/`from` de um webhook de
 * chamada) recortado nos últimos 8 dígitos — usar contra `phoneLast8Index`/`whatsappLast8Index`
 * no lugar do antigo `contains` de substring. */
export function last8DigitsIndex(rawPhoneNumber: string | null | undefined): string | null {
  if (!rawPhoneNumber) return null;
  const last8 = lastNDigits(rawPhoneNumber, 8);
  return last8 ? hmac(last8) : null;
}

/** Mesma ideia de `last8DigitsIndex`, recortando 9 dígitos — usado por
 * `whatsappMessage.service.ts` (`findContactByPhone`), que já casava por 9 dígitos
 * significativos antes deste índice existir. */
export function last9DigitsIndex(rawPhoneNumber: string | null | undefined): string | null {
  if (!rawPhoneNumber) return null;
  const last9 = lastNDigits(rawPhoneNumber, 9);
  return last9 ? hmac(last9) : null;
}

/**
 * Cláusulas `OR` de índice para a busca livre de `ContactService.findAll`/
 * `PrismaContactRepository.findAllWithFilters` — o `contains` que antes existia para
 * email/phone/whatsapp não tem como funcionar contra o campo cifrado (nenhum índice de igualdade
 * resolve busca por SUBSTRING arbitrária: gap real, documentado em `piiFields.ts`, não corrigido
 * aqui). Isto cobre os dois casos de busca exata que continuam funcionando bem apesar disso:
 * o usuário digitou um e-mail completo, ou digitou dígitos de telefone que batem com os últimos 8
 * dígitos de um `phone`/`whatsapp` cadastrado.
 */
export function contactSearchIndexClauses(query: string): Array<Record<string, string>> {
  const clauses: Array<Record<string, string>> = [];
  if (query.includes('@')) {
    const emailIndex = contactEmailIndex(query);
    if (emailIndex) clauses.push({ emailIndex });
  }
  const digits = query.replace(/\D/g, '');
  if (digits.length >= 4) {
    const idx = last8DigitsIndex(digits);
    if (idx) {
      clauses.push({ phoneLast8Index: idx });
      clauses.push({ whatsappLast8Index: idx });
    }
  }
  return clauses;
}

/** Todos os índices de um Contact a partir dos valores em texto puro — usado tanto pela extensão
 * do Prisma (grava a cada create/update) quanto pelo script de backfill. */
export function computeContactPiiIndexes(fields: {
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
}): {
  emailIndex: string | null;
  emailDomainIndex: string | null;
  phoneIndex: string | null;
  phoneLast8Index: string | null;
  phoneLast9Index: string | null;
  whatsappIndex: string | null;
  whatsappLast8Index: string | null;
  whatsappLast9Index: string | null;
} {
  return {
    emailIndex: contactEmailIndex(fields.email),
    emailDomainIndex: contactEmailDomainIndex(fields.email),
    phoneIndex: contactPhoneIndex(fields.phone),
    phoneLast8Index: contactPhoneLast8Index(fields.phone),
    phoneLast9Index: contactPhoneLast9Index(fields.phone),
    whatsappIndex: contactWhatsappIndex(fields.whatsapp),
    whatsappLast8Index: contactWhatsappLast8Index(fields.whatsapp),
    whatsappLast9Index: contactWhatsappLast9Index(fields.whatsapp),
  };
}
