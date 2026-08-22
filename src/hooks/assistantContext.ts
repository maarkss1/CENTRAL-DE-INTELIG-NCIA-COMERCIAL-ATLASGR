export type AssistantContextMode = 'internal' | 'general';
export type AssistantContextSource = 'general' | 'internal' | 'roleplay';

export interface AssistantRouteContext {
    pathname: string;
    label: string;
}

export interface AssistantRecordContext {
    type: 'company' | 'contact' | 'lead' | 'deal' | 'document';
    id: string;
    label: string;
    summary?: string;
}

const ROUTE_LABELS: Array<[RegExp, string]> = [
    [/^\/app\/crm(?:\/|$)/, 'CRM / pipeline comercial'],
    [/^\/app\/companies(?:\/|$)/, 'Empresas / inteligência de contas'],
    [/^\/app\/contacts(?:\/|$)/, 'Contatos'],
    [/^\/app\/prospecting(?:\/|$)/, 'Prospecção'],
    [/^\/app\/intelligence(?:\/|$)/, 'Hub de IA e automações'],
    [/^\/app\/chatbook(?:\/|$)/, 'Chatbook / copiloto comercial'],
    [/^\/app\/dashboard(?:\/|$)/, 'Dashboard executivo'],
];

export function getAssistantRouteContext(pathname: string): AssistantRouteContext {
    const normalizedPathname = pathname || '/';
    const match = ROUTE_LABELS.find(([pattern]) => pattern.test(normalizedPathname));
    return {
        pathname: normalizedPathname,
        label: match?.[1] ?? 'Área operacional da plataforma',
    };
}

export function formatAssistantRecordContext(activeRecord: AssistantRecordContext | null): string {
    if (!activeRecord) return '';
    const typeLabel: Record<AssistantRecordContext['type'], string> = {
        company: 'empresa',
        contact: 'contato',
        lead: 'lead',
        deal: 'negócio',
        document: 'documento comercial',
    };
    return [
        `REGISTRO ABERTO NA TELA (${typeLabel[activeRecord.type]}): ${activeRecord.label}`,
        `ID interno: ${activeRecord.id}`,
        activeRecord.summary ? `Resumo visível: ${activeRecord.summary}` : '',
    ].filter(Boolean).join('\n');
}

export function buildAssistantLocalContext(input: {
    route: AssistantRouteContext;
    activeRecord: AssistantRecordContext | null;
    internalContext?: string;
}): string {
    return [
        `ROTA ATUAL: ${input.route.label} (${input.route.pathname})`,
        formatAssistantRecordContext(input.activeRecord),
        input.internalContext?.trim() ? `BASE INTERNA SELECIONADA:\n${input.internalContext.trim()}` : '',
    ].filter(Boolean).join('\n\n');
}
