/**
 * Mapeamento de entidade Bitrix → método REST, usado pelo serviço real de Extrações
 * (`extraction.ts`). Uma única tabela pequena em vez de um `switch` espalhado — cada entidade nova
 * suportada no futuro (ex.: `crm.item.list` de SPAs custom) entra como uma linha, sem tocar no
 * resto do serviço.
 */

export type BitrixExtractionEntity = 'lead' | 'deal' | 'company' | 'contact' | 'activity' | 'user';

export const ALL_EXTRACTION_ENTITIES: readonly BitrixExtractionEntity[] = [
    'lead', 'deal', 'company', 'contact', 'activity', 'user',
];

export interface BitrixExtractionEntitySpec {
    /** Método `crm.<entidade>.list` (ou `user.get`, que segue a mesma forma de paginação). */
    listMethod: string;
    /** Método `crm.<entidade>.fields` — `null` quando o Bitrix não expõe metadados de campo para esta entidade (usuário). */
    fieldsMethod: string | null;
    /** Campo de data usado pelo filtro de período — `null` quando a entidade não tem um campo de data confiável para filtrar (usuário). */
    dateField: string | null;
    /** Campo usado pelo filtro de busca textual (título/nome) — `null` quando não há um campo de texto livre óbvio. */
    searchField: string | null;
    /** Rótulo em PT-BR para mensagens de erro/UI. */
    label: string;
}

export const EXTRACTION_ENTITY_SPECS: Record<BitrixExtractionEntity, BitrixExtractionEntitySpec> = {
    lead: { listMethod: 'crm.lead.list', fieldsMethod: 'crm.lead.fields', dateField: 'DATE_CREATE', searchField: 'TITLE', label: 'Leads' },
    deal: { listMethod: 'crm.deal.list', fieldsMethod: 'crm.deal.fields', dateField: 'DATE_CREATE', searchField: 'TITLE', label: 'Negócios' },
    company: { listMethod: 'crm.company.list', fieldsMethod: 'crm.company.fields', dateField: 'DATE_CREATE', searchField: 'TITLE', label: 'Empresas' },
    contact: { listMethod: 'crm.contact.list', fieldsMethod: 'crm.contact.fields', dateField: 'DATE_CREATE', searchField: 'NAME', label: 'Contatos' },
    activity: { listMethod: 'crm.activity.list', fieldsMethod: 'crm.activity.fields', dateField: 'CREATED', searchField: 'SUBJECT', label: 'Atividades' },
    // user.get não tem um crm.*.fields equivalente nem um campo de data confiável pra filtrar por
    // período (DATE_REGISTER existe mas não é um filtro documentado/estável na REST API) — extração
    // de usuários ignora `period`/`search` por design, não por bug; ver comentário em extraction.ts.
    user: { listMethod: 'user.get', fieldsMethod: null, dateField: null, searchField: null, label: 'Usuários' },
};

export function isExtractionEntity(value: unknown): value is BitrixExtractionEntity {
    return typeof value === 'string' && (ALL_EXTRACTION_ENTITIES as readonly string[]).includes(value);
}

/**
 * Campos fixos devolvidos por `user.get` — não há metadados dinâmicos como nos objetos CRM. Lista
 * alinhada à ferramenta de referência (`public/tools/extrator-bitrix.html`,
 * `CAMPOS_USUARIO_COMPLETO`), citada como material de referência funcional pelo prompt do 06A —
 * mesmas seis entidades, mesmos métodos REST, mesmo campo de data por entidade e a mesma decisão
 * de não filtrar Usuários por período, confirmados independentemente por este serviço.
 */
export const USER_ENTITY_FIXED_FIELDS: readonly string[] = [
    'ID', 'XML_ID', 'ACTIVE', 'NAME', 'LAST_NAME', 'SECOND_NAME', 'EMAIL', 'LOGIN',
    'WORK_POSITION', 'PERSONAL_PHONE', 'PERSONAL_MOBILE', 'PERSONAL_WWW', 'PERSONAL_BIRTHDAY',
    'LAST_LOGIN', 'DATE_REGISTER', 'TIME_ZONE', 'UF_DEPARTMENT', 'IS_ONLINE',
];
