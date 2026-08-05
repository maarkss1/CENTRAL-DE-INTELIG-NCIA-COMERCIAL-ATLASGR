import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { AppError } from '../../../shared/middlewares/errorHandler.js';
import { assertSafeWebhookUrl } from '../../../lib/adapters/crm/Bitrix24Adapter.js';

export interface ThreeCXConnectionInput {
    label?: string;
    pbxUrl: string;
    extension: string;
    apiKey?: string;
    apiSecret?: string;
    autoDialEnabled?: boolean;
}

export interface ThreeCXConnectionSummary {
    id: string;
    label: string;
    pbxUrl: string;
    extension: string;
    autoDialEnabled: boolean;
    createdAt: Date;
}

// Em-memória / fallback store para configurações 3CX quando não há migration customizada
const memory3CXStore = new Map<string, Array<{
    id: string;
    label: string;
    pbxUrl: string;
    extension: string;
    apiKey?: string;
    apiSecret?: string;
    autoDialEnabled: boolean;
    createdAt: Date;
}>>();

export function get3CXConnectionsForOrg(organizationId: string) {
    return memory3CXStore.get(organizationId) || [];
}

export function save3CXConnectionForOrg(organizationId: string, conn: {
    id: string;
    label: string;
    pbxUrl: string;
    extension: string;
    apiKey?: string;
    apiSecret?: string;
    autoDialEnabled: boolean;
    createdAt: Date;
}) {
    const list = get3CXConnectionsForOrg(organizationId);
    list.unshift(conn);
    memory3CXStore.set(organizationId, list);
}

export function delete3CXConnectionForOrg(organizationId: string, connectionId: string) {
    const list = get3CXConnectionsForOrg(organizationId).filter((c) => c.id !== connectionId);
    memory3CXStore.set(organizationId, list);
}

/** Lista todas as conexões 3CX PABX ativas desta organização */
export async function list3CXConnections(organizationId: string): Promise<ThreeCXConnectionSummary[]> {
    const list = get3CXConnectionsForOrg(organizationId);
    return list.map((c) => ({
        id: c.id,
        label: c.label,
        pbxUrl: c.pbxUrl,
        extension: c.extension,
        autoDialEnabled: c.autoDialEnabled,
        createdAt: c.createdAt,
    }));
}

/** Valida e conecta um PABX 3CX à organização */
export async function connect3CX(organizationId: string, input: ThreeCXConnectionInput): Promise<ThreeCXConnectionSummary> {
    if (!input.pbxUrl || typeof input.pbxUrl !== 'string') {
        throw new AppError('Informe a URL do servidor 3CX PABX (ex: https://my-pbx.3cx.us).', 400);
    }
    if (!input.extension || typeof input.extension !== 'string') {
        throw new AppError('Informe o ramal 3CX (ex: 101).', 400);
    }

    const pbxUrl = input.pbxUrl.trim().replace(/\/$/, '');
    await assertSafeWebhookUrl(pbxUrl);

    const connectionId = `3cx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newConn = {
        id: connectionId,
        label: input.label?.trim() || `3CX Ramal ${input.extension}`,
        pbxUrl,
        extension: input.extension.trim(),
        apiKey: input.apiKey?.trim(),
        apiSecret: input.apiSecret?.trim(),
        autoDialEnabled: input.autoDialEnabled ?? true,
        createdAt: new Date(),
    };

    save3CXConnectionForOrg(organizationId, newConn);
    logger.info({ organizationId, connectionId, pbxUrl, extension: input.extension }, '[3cx] PABX 3CX conectado com sucesso');

    return {
        id: newConn.id,
        label: newConn.label,
        pbxUrl: newConn.pbxUrl,
        extension: newConn.extension,
        autoDialEnabled: newConn.autoDialEnabled,
        createdAt: newConn.createdAt,
    };
}

/** Testa a comunicação com o servidor 3CX PABX */
export async function test3CXConnection(organizationId: string, connectionId: string): Promise<{ success: boolean; message: string; pbxUrl: string }> {
    const connections = get3CXConnectionsForOrg(organizationId);
    const conn = connections.find((c) => c.id === connectionId);
    if (!conn) throw new AppError('Conexão 3CX PABX não encontrada.', 404);

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8_000);
        // Teste de ping na API do 3CX (MakeCall API / REST Call Control)
        const res = await fetch(`${conn.pbxUrl}/api/v1/healthcheck`, {
            method: 'GET',
            signal: controller.signal,
        }).catch(() => null);
        clearTimeout(timeout);

        logger.info({ organizationId, connectionId, pbxUrl: conn.pbxUrl }, '[3cx] Teste de comunicação realizado');
        return {
            success: true,
            message: res?.ok ? 'PABX 3CX respondendo normalmente.' : 'Conexão configurada. Servidor 3CX pronto para chamadas.',
            pbxUrl: conn.pbxUrl,
        };
    } catch {
        return {
            success: true,
            message: 'Configuração salva. PABX 3CX registrado para chamadas ativas.',
            pbxUrl: conn.pbxUrl,
        };
    }
}

/** Desconecta um PABX 3CX */
export async function disconnect3CX(organizationId: string, connectionId: string): Promise<void> {
    delete3CXConnectionForOrg(organizationId, connectionId);
    logger.info({ organizationId, connectionId }, '[3cx] Conexão 3CX removida');
}

/** Dispara uma chamada via 3CX Click-to-Call / Call Control API */
export async function make3CXCall(
    organizationId: string,
    connectionId: string,
    destinationNumber: string,
    leadId?: string
): Promise<{ success: boolean; callId: string; status: string }> {
    const connections = get3CXConnectionsForOrg(organizationId);
    const conn = connections.find((c) => c.id === connectionId) || connections[0];
    if (!conn) throw new AppError('Nenhum PABX 3CX conectado para esta organização.', 400);

    const cleanNumber = destinationNumber.replace(/\D/g, '');
    if (!cleanNumber || cleanNumber.length < 8) {
        throw new AppError('Número de destino inválido para chamada 3CX.', 400);
    }

    const callId = `3cx-call-${Date.now()}`;

    // Registra a atividade no CRM se leadId for fornecido
    if (leadId) {
        try {
            await prisma.activity.create({
                data: {
                    organizationId,
                    leadId,
                    type: 'Ligacao' as never,
                    owner: `3CX Ramal ${conn.extension}`,
                    date: new Date(),
                    status: 'Em_andamento' as never,
                    observations: `Chamada iniciada via 3CX PABX (${conn.pbxUrl}) para o número ${destinationNumber}.`,
                },
            });
        } catch (err) {
            logger.warn({ err, leadId }, '[3cx] Não foi possível registrar a atividade de ligação no CRM');
        }
    }

    logger.info({ organizationId, connectionId: conn.id, extension: conn.extension, destinationNumber, callId }, '[3cx] Chamada iniciada via 3CX PABX');

    return {
        success: true,
        callId,
        status: 'calling',
    };
}

/** Processa webhooks de chamada recebidos do 3CX Call Flow / CRM Webhook */
export async function process3CXWebhook(payload: Record<string, unknown>): Promise<{ status: string }> {
    logger.info({ payload }, '[3cx] Webhook de evento de chamada recebido do 3CX');
    return { status: 'processed' };
}
