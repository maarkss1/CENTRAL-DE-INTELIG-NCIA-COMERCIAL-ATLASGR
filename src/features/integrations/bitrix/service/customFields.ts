import { logger } from '../../../../lib/logger.js';
import { BITRIX_FIELD_MAP, type BitrixFieldMapping } from '../bitrixFieldMap.js';
import { callBitrix } from './client.js';

export type BitrixEntityKind = 'lead' | 'deal';

interface EnumTranslation {
    idToText: Map<string, string>;
    textToId: Map<string, string>; // chave: texto em minúsculas/trim
}

interface BitrixFieldDefRaw {
    type?: string;
    items?: Array<{ ID: string; VALUE: string }>;
}

interface FieldMapsCacheEntry {
    webhookUrl: string;
    entity: BitrixEntityKind;
    maps: Map<string, EnumTranslation>; // chave: código UF_CRM_*
    fetchedAt: number;
}

// Reconfiguração de campo custom no admin do Bitrix é rara o bastante para não justificar uma
// chamada de rede extra (crm.lead.fields/crm.deal.fields) a cada sincronização — mesmo espírito
// do cache de getStatusLabels em client.ts, só que por (webhookUrl, entity) e com expiração, já
// que aqui o custo de servir um valor desatualizado por até 10 min é maior (grava dado errado).
const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: FieldMapsCacheEntry | null = null;

async function fetchEnumMaps(webhookUrl: string, entity: BitrixEntityKind): Promise<Map<string, EnumTranslation>> {
    const method = entity === 'lead' ? 'crm.lead.fields' : 'crm.deal.fields';
    const codes = BITRIX_FIELD_MAP
        .map((m) => (entity === 'lead' ? m.leadCode : m.dealCode))
        .filter((c): c is string => Boolean(c));

    const data = await callBitrix<{ result: Record<string, BitrixFieldDefRaw> }>(webhookUrl, method, {});
    const maps = new Map<string, EnumTranslation>();
    for (const code of codes) {
        const def = data.result[code];
        const idToText = new Map<string, string>();
        const textToId = new Map<string, string>();
        for (const item of def?.items || []) {
            idToText.set(String(item.ID), item.VALUE);
            textToId.set(item.VALUE.trim().toLowerCase(), String(item.ID));
        }
        maps.set(code, { idToText, textToId });
    }
    return maps;
}

/**
 * Resolve os mapas ID↔texto de todo campo enumeration/boolean_sim_nao do BITRIX_FIELD_MAP para UM
 * dos dois objetos (Lead ou Negócio) — os IDs de `items` são específicos deste portal, nunca
 * hardcoded (ver cabeçalho de bitrixFieldMap.ts). Esta é a função referenciada lá como
 * "resolveEnumMaps" — antes desta implementação existia só o comentário, sem código nenhum por
 * trás (achado da auditoria BITRIX24-LEAD-FLOW-AUDIT.md, item P4-1).
 */
export async function resolveEnumMaps(webhookUrl: string, entity: BitrixEntityKind): Promise<Map<string, EnumTranslation>> {
    if (cache && cache.webhookUrl === webhookUrl && cache.entity === entity && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
        return cache.maps;
    }
    const maps = await fetchEnumMaps(webhookUrl, entity);
    cache = { webhookUrl, entity, maps, fetchedAt: Date.now() };
    return maps;
}

export interface BitrixFieldOption {
    code: string;
    label: string;
}

interface BitrixFieldMetaRaw {
    title?: string;
    listLabel?: string;
    formLabel?: string;
    filterLabel?: string;
}

/**
 * Lista TODOS os campos existentes (fixos do sistema + UF_CRM_* personalizados) de Lead ou
 * Negócio neste portal — usada pela tela de importação (BitrixImportPanel) para deixar a pessoa
 * escolher, por nome, um campo personalizado para filtrar a busca (ex.: "Segmento", "Perfil de
 * Risco") sem precisar saber o código UF_CRM_ de cor. Mesmo método (`crm.lead.fields`/
 * `crm.deal.fields`) já usado por fetchEnumMaps acima, mas devolvendo o rótulo amigável de cada
 * campo em vez de só os itens de enum dos campos do BITRIX_FIELD_MAP.
 */
export async function getEntityFields(webhookUrl: string, entity: BitrixEntityKind): Promise<BitrixFieldOption[]> {
    const method = entity === 'lead' ? 'crm.lead.fields' : 'crm.deal.fields';
    const data = await callBitrix<{ result: Record<string, BitrixFieldMetaRaw> }>(webhookUrl, method, {});
    return Object.entries(data.result || {})
        .map(([code, meta]) => ({
            code,
            label: meta.title || meta.listLabel || meta.formLabel || meta.filterLabel || code,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

function formatBitrixDate(value: unknown): string | null {
    const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
}

function getByTarget(source: { lead: Record<string, unknown>; qualification: Record<string, unknown>; contact: Record<string, unknown> }, target: BitrixFieldMapping['target']): unknown {
    if (target.kind === 'qualification') return source.qualification[target.field];
    if (target.kind === 'contact') return source.contact[target.field];
    return source.lead[target.field];
}

/**
 * Monta o pedaço `UF_CRM_*` do payload de `crm.lead.add`/`crm.lead.update` (ou Deal) a partir dos
 * ~35 campos comerciais do Atlas — a metade "saída" da ponte que bitrixFieldMap.ts descreve.
 * Ignora silenciosamente (com log em debug, não warn — é esperado a maioria dos campos estarem
 * vazios num lead recém-criado) qualquer campo sem valor local ou cujo texto não bate com nenhum
 * item do enum resolvido (ex.: um valor legado que não existe mais como opção no Bitrix).
 */
export function buildOutboundCustomFields(
    leadRow: Record<string, unknown>,
    qualification: Record<string, unknown> | null | undefined,
    contactRow: Record<string, unknown> | null | undefined,
    entity: BitrixEntityKind,
    enumMaps: Map<string, EnumTranslation>,
): Record<string, unknown> {
    const source = { lead: leadRow, qualification: qualification || {}, contact: contactRow || {} };
    const fields: Record<string, unknown> = {};

    for (const mapping of BITRIX_FIELD_MAP) {
        const code = entity === 'lead' ? mapping.leadCode : mapping.dealCode;
        if (!code) continue;

        const raw = getByTarget(source, mapping.target);
        if (raw === null || raw === undefined || raw === '') continue;

        if (mapping.type === 'string') {
            fields[code] = String(raw).trim();
        } else if (mapping.type === 'double') {
            const n = typeof raw === 'number' ? raw : Number(raw);
            if (Number.isFinite(n)) fields[code] = n;
        } else if (mapping.type === 'date') {
            const formatted = formatBitrixDate(raw);
            if (formatted) fields[code] = formatted;
        } else if (mapping.type === 'enumeration' || mapping.type === 'boolean_sim_nao') {
            const text = mapping.type === 'boolean_sim_nao'
                ? (raw === true || raw === 'true' ? 'Sim' : raw === false || raw === 'false' ? 'Não' : String(raw))
                : String(raw);
            const enumId = enumMaps.get(code)?.textToId.get(text.trim().toLowerCase());
            if (enumId) {
                fields[code] = enumId;
            } else {
                logger.debug({ code, label: mapping.label, text }, '[bitrix] Valor local não corresponde a nenhuma opção do campo enumeration no Bitrix — não enviado');
            }
        }
    }

    return fields;
}

interface InboundCustomFieldsResult {
    qualification: Record<string, unknown>;
    leadFields: Record<string, unknown>;
    contactRole: string | null;
}

// Ao contrário dos outros alvos `kind: 'lead'` deste mapa (todos String?/Boolean? no Prisma), a
// coluna Lead.temperature é o enum LeadTemperature (Frio|Morno|Quente) — só aceita EXATAMENTE um
// desses três valores. Um texto do Bitrix que não bata (ou o ID bruto, quando a tradução do enum
// falha — ver fallback abaixo) faz o Prisma rejeitar o update INTEIRO do Lead, não só este campo.
// É o que gerava "erro interno" no webhook de entrada e na importação (import/webhook chamam
// applyInboundCustomFields e gravam leadFields direto via `...leadFields` sem validação).
const LEAD_ENUM_COLUMNS: Record<string, readonly string[]> = {
    temperature: ['Frio', 'Morno', 'Quente'],
};

/**
 * Garante que um valor destinado a uma coluna `kind: 'lead'` que é enum no Prisma só é gravado
 * quando bate (case-insensitive) com uma das opções válidas — senão devolve `undefined` para o
 * campo ser omitido, em vez de quebrar o update inteiro. Campos `kind: 'lead'` sem enum Prisma
 * (a maioria) passam direto, sem validação.
 */
function coerceLeadFieldValue(field: string, value: unknown): unknown {
    const allowed = LEAD_ENUM_COLUMNS[field];
    if (!allowed) return value;
    return allowed.find((option) => option.toLowerCase() === String(value).trim().toLowerCase());
}

/**
 * Caminho inverso de buildOutboundCustomFields — extrai os `UF_CRM_*` de um registro cru do
 * Bitrix (retorno de crm.lead.get/crm.deal.get, ou de um crm.lead.list cujo `select` os inclui) e
 * devolve os valores já traduzidos (ID de enum → texto) e organizados por destino local, prontos
 * para gravar em Lead/Company/Contact.
 */
export function applyInboundCustomFields(
    raw: Record<string, unknown>,
    entity: BitrixEntityKind,
    enumMaps: Map<string, EnumTranslation>,
): InboundCustomFieldsResult {
    const qualification: Record<string, unknown> = {};
    const leadFields: Record<string, unknown> = {};
    let contactRole: string | null = null;

    for (const mapping of BITRIX_FIELD_MAP) {
        const code = entity === 'lead' ? mapping.leadCode : mapping.dealCode;
        if (!code) continue;

        const rawValue = raw[code];
        if (rawValue === null || rawValue === undefined || rawValue === '') continue;

        let value: unknown;
        if (mapping.type === 'string') {
            value = String(rawValue).trim();
        } else if (mapping.type === 'double') {
            const n = Number(rawValue);
            if (!Number.isFinite(n)) continue;
            value = n;
        } else if (mapping.type === 'date') {
            value = formatBitrixDate(rawValue);
            if (!value) continue;
        } else if (mapping.type === 'enumeration' || mapping.type === 'boolean_sim_nao') {
            // Bitrix devolve o ID como string (ou array de 1 item, em alguns campos multi-select
            // configurados como single) — normaliza antes de resolver.
            const idRaw = Array.isArray(rawValue) ? rawValue[0] : rawValue;
            const text = enumMaps.get(code)?.idToText.get(String(idRaw));
            if (!text) {
                logger.debug({ code, label: mapping.label, idRaw }, '[bitrix] ID de enum recebido do Bitrix sem tradução conhecida — mantendo o ID bruto');
            }
            const resolved = text || String(idRaw);
            value = mapping.type === 'boolean_sim_nao' ? /^sim$/i.test(resolved) : resolved;
        } else {
            continue;
        }

        if (mapping.target.kind === 'qualification') {
            qualification[mapping.target.field] = value;
        } else if (mapping.target.kind === 'contact') {
            contactRole = String(value);
        } else {
            const coerced = coerceLeadFieldValue(mapping.target.field, value);
            if (coerced === undefined && value !== undefined) {
                logger.warn({ code, label: mapping.label, value }, '[bitrix] Valor recebido não corresponde a nenhuma opção válida da coluna local — campo não gravado (evita rejeitar o update inteiro do Lead)');
                continue;
            }
            leadFields[mapping.target.field] = coerced;
        }
    }

    return { qualification, leadFields, contactRole };
}
