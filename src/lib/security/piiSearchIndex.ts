import { createHmac } from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../logger.js';
import {
    normalizeEmailForDedupe,
    normalizePhoneForDedupe,
} from '../../features/prospecting/utils/contactDedupe.js';

// Índice de busca determinístico (HMAC-SHA256) para PII de `Contact` (CPI — dossiê de auditoria,
// DEC-01, opção A). Existe para permitir busca EXATA (`WHERE phone = / email = / whatsapp =`) e
// detecção de duplicidade continuarem funcionando no dia em que `Contact.phone/email/whatsapp`
// voltarem a ser cifrados em repouso (AES-256-GCM, ver src/lib/crypto/piiFields.ts) — cifra com IV
// aleatório por valor nunca produz o mesmo ciphertext duas vezes, então nenhum WHERE de igualdade
// sobre a coluna cifrada pode funcionar (é exatamente o que quebrou 4 fluxos reais na onda 39, ver
// .agents/handoffs/onda-39/01-para-00-pii-contact-revertida-quebra-integration.md).
//
// Mecanismo: HMAC-SHA256(valor normalizado, segredo de aplicação) → hex digest, gravado num campo
// "<campo>Hash" separado (ex.: `Contact.emailHash`) ao lado do campo original. HMAC (não hash
// puro) é o que importa aqui: sem o segredo, ninguém consegue montar um dicionário
// valor→hash offline e reidentificar e-mails/telefones a partir do índice — só quem tem
// PII_SEARCH_HMAC_SECRET consegue calcular o mesmo hash de novo. O texto cifrado nunca é usado
// para comparação, só para exibição (decifrado); o campo "<campo>Hash" nunca é decifrado/exibido —
// só serve para `WHERE`/`groupBy`.
//
// IMPORTANTE — este módulo assume que `Contact.phoneHash`/`emailHash`/`whatsappHash` existem no
// schema. Nesta rodada esses campos NÃO foram criados por esta mudança (schema.prisma e migrations
// são de dono único deste repositório) — ver o handoff
// .agents/handoffs/onda-42/01-para-00-pii-hash-fields.md para os campos exatos pedidos e o plano de
// backfill. Este módulo e os pontos de escrita/leitura que o usam ficam INERTES (Prisma lança
// "Unknown argument") até a migration ser aplicada e `prisma generate` rodar de novo.

const ALGORITHM = 'sha256';

function resolveSecret(): string {
    const raw = env.PII_SEARCH_HMAC_SECRET;
    if (!raw) {
        if (env.NODE_ENV === 'production') {
            // Fail-closed: mesma regra de CREDENTIALS_ENCRYPTION_KEY/BETTER_AUTH_SECRET — nunca
            // inventa um segredo padrão em produção (um segredo previsível permite a qualquer um
            // que conheça o valor puro de um telefone/e-mail confirmar se ele existe na base,
            // calculando o mesmo HMAC offline).
            throw new Error(
                'PII_SEARCH_HMAC_SECRET ausente em produção — obrigatória para o índice de busca determinístico de PII de Contact (phone/email/whatsapp). Gere uma com `openssl rand -base64 32`.',
            );
        }
        logger.warn(
            '[piiSearchIndex] PII_SEARCH_HMAC_SECRET não configurada — usando segredo fixo de desenvolvimento local. NUNCA use isso em produção (a trava acima impede a subida sem a variável real).',
        );
        // Fixo e conhecido, só para dev/test local — nunca alcançável em produção (guard acima).
        return 'insecure-dev-only-pii-search-index-secret';
    }
    return raw;
}

let cachedSecret: string | null = null;
function getSecret(): string {
    if (!cachedSecret) cachedSecret = resolveSecret();
    return cachedSecret;
}

/** Exposto só para os testes poderem forçar a reavaliação do segredo entre casos. */
export function _resetSecretCacheForTests(): void {
    cachedSecret = null;
}

/**
 * HMAC-SHA256 (hex) de um valor já normalizado. Não normaliza por conta própria — quem chama
 * decide a normalização (ver `hashEmailForSearchIndex`/`hashPhoneForSearchIndex` abaixo), para que
 * o mesmo valor lógico (ex.: "(11) 99999-8888" e "11999998888") sempre produza o mesmo hash,
 * independente de como foi digitado/formatado na origem.
 */
export function hmacForSearchIndex(normalizedValue: string): string {
    return createHmac(ALGORITHM, getSecret()).update(normalizedValue, 'utf8').digest('hex');
}

/**
 * E-mail → hash de índice de busca. Reusa `normalizeEmailForDedupe` (trim + lowercase, já a
 * definição canônica de "mesmo e-mail" usada pelo dedupe de prospecção,
 * src/features/prospecting/utils/contactDedupe.ts) para que o mesmo valor lógico sempre hasheie
 * igual, e para não inventar uma terceira definição de "e-mail normalizado" no repositório. `null`
 * para vazio/ausente — nunca gera hash de string vazia (evita colisão de "todos os contatos sem
 * e-mail" batendo entre si numa busca).
 */
export function hashEmailForSearchIndex(email: string | null | undefined): string | null {
    const normalized = normalizeEmailForDedupe(email);
    return normalized ? hmacForSearchIndex(normalized) : null;
}

/**
 * Telefone (ou WhatsApp — mesmo formato de telefone) → hash de índice de busca. Reusa
 * `normalizePhoneForDedupe` (só dígitos, descarta menos de 8 dígitos) pelo mesmo motivo do e-mail
 * acima.
 */
export function hashPhoneForSearchIndex(phone: string | null | undefined): string | null {
    const normalized = normalizePhoneForDedupe(phone);
    return normalized ? hmacForSearchIndex(normalized) : null;
}

/** Nome do campo `*Hash` e a função de normalização/hash correspondente, por campo de `Contact`. */
export const CONTACT_HASHED_FIELDS: Record<string, { hashField: string; hash: (value: unknown) => string | null }> = {
    phone: { hashField: 'phoneHash', hash: (v) => hashPhoneForSearchIndex(typeof v === 'string' ? v : null) },
    whatsapp: { hashField: 'whatsappHash', hash: (v) => hashPhoneForSearchIndex(typeof v === 'string' ? v : null) },
    email: { hashField: 'emailHash', hash: (v) => hashEmailForSearchIndex(typeof v === 'string' ? v : null) },
};

/**
 * A partir de um payload de `create`/`update` de `Contact`, devolve só os campos `*Hash` que
 * precisam ser gravados junto — um por campo de PII presente no payload (`phone`/`whatsapp`/
 * `email`), nunca os que não foram tocados. Isso é o que permite um `update` parcial (ex.: só
 * `role`) não apagar o hash de um telefone/e-mail que não fez parte desta escrita, e um `update`
 * que limpa o campo (`phone: null`) também limpar o hash correspondente.
 *
 * Só considera valores `string` ou `null` — um operador aninhado do Prisma (`{ phone: { set: 'x'
 * } }`, que este código-base não usa hoje para `Contact`, mas o Prisma aceita) é deixado como está,
 * sem calcular hash, em vez de arriscar um hash errado a partir de um formato inesperado.
 */
export function computeContactHashFields(data: Record<string, unknown>): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    for (const [field, { hashField, hash }] of Object.entries(CONTACT_HASHED_FIELDS)) {
        if (!(field in data)) continue;
        const value = data[field];
        if (typeof value === 'string' || value === null) {
            out[hashField] = hash(value);
        }
    }
    return out;
}
