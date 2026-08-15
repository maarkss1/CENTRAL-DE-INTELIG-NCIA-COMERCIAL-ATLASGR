import type { ThreeCXConnection } from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { AppError } from '../../../shared/middlewares/errorHandler.js';
import { assertSafeWebhookUrl } from '../../../lib/adapters/crm/Bitrix24Adapter.js';
import { isSuppressed } from '../birth-voice/callSuppression.service.js';

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

// Persistência real via Prisma (model ThreeCXConnection, prisma/schema.prisma) — antes disso,
// estas três funções liam/escreviam um `Map` em memória (`memory3CXStore`), perdido a cada
// restart/redeploy do processo e inconsistente entre instâncias quando há mais de um processo do
// servidor rodando ao mesmo tempo. Ver handoff
// .agents/handoffs/onda-1/06-para-01-persistencia-3cx.md (resolvido em
// .agents/handoffs/onda-5/01-para-06-persistencia-3cx-implementada.md). apiKey/apiSecret são
// cifrados/decifrados em repouso de forma transparente pela extensão Prisma em src/lib/prisma.ts
// (ver ENCRYPTED_FIELDS) — mesmo tratamento de BitrixConnection.webhookUrl/webhookSecret.
export async function get3CXConnectionsForOrg(organizationId: string): Promise<ThreeCXConnection[]> {
    return prisma.threeCXConnection.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
    });
}

export async function save3CXConnectionForOrg(organizationId: string, conn: {
    id: string;
    label: string;
    pbxUrl: string;
    extension: string;
    apiKey?: string;
    apiSecret?: string;
    autoDialEnabled: boolean;
    createdAt: Date;
}): Promise<void> {
    // `id` é gerado pelo caller (connect3CX, formato "3cx-<timestamp>-<random>") em vez do
    // cuid() padrão do model — preservado aqui para não mudar o formato de id já em uso na UI/logs.
    await prisma.threeCXConnection.create({
        data: {
            id: conn.id,
            organizationId,
            label: conn.label,
            pbxUrl: conn.pbxUrl,
            extension: conn.extension,
            apiKey: conn.apiKey,
            apiSecret: conn.apiSecret,
            autoDialEnabled: conn.autoDialEnabled,
        },
    });
}

export async function delete3CXConnectionForOrg(organizationId: string, connectionId: string): Promise<void> {
    // deleteMany (não delete) porque o filtro já inclui organizationId — nunca apaga uma conexão
    // de outra organização mesmo que connectionId seja adivinhado/manipulado (0 linhas afetadas
    // em vez de erro "not found" ambíguo entre "não existe" e "existe em outro tenant").
    await prisma.threeCXConnection.deleteMany({ where: { id: connectionId, organizationId } });
}

/** Lista todas as conexões 3CX PABX ativas desta organização */
export async function list3CXConnections(organizationId: string): Promise<ThreeCXConnectionSummary[]> {
    const list = await get3CXConnectionsForOrg(organizationId);
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

    await save3CXConnectionForOrg(organizationId, newConn);
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
    const connections = await get3CXConnectionsForOrg(organizationId);
    const conn = connections.find((c) => c.id === connectionId);
    if (!conn) throw new AppError('Conexão 3CX PABX não encontrada.', 404);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
        // Teste de ping na API do 3CX (MakeCall API / REST Call Control)
        const res = await fetch(`${conn.pbxUrl}/api/v1/healthcheck`, {
            method: 'GET',
            signal: controller.signal,
        });

        logger.info({ organizationId, connectionId, pbxUrl: conn.pbxUrl, ok: res.ok }, '[3cx] Teste de comunicação realizado');
        // CORREÇÃO: antes este retorno era sempre success:true (inclusive quando o ping falhava ou
        // dava timeout) — o botão "Testar conexão" nunca conseguia reportar um problema real ao
        // usuário. Agora reflete o resultado de verdade do healthcheck.
        return {
            success: res.ok,
            message: res.ok ? 'PABX 3CX respondendo normalmente.' : `Servidor 3CX respondeu com erro (HTTP ${res.status}).`,
            pbxUrl: conn.pbxUrl,
        };
    } catch (err) {
        const timedOut = controller.signal.aborted;
        logger.warn({ err, organizationId, connectionId, pbxUrl: conn.pbxUrl, timedOut }, '[3cx] Falha ao testar comunicação com o PABX');
        return {
            success: false,
            message: timedOut
                ? 'Tempo limite esgotado ao comunicar com o servidor 3CX (timeout 8s).'
                : 'Não foi possível comunicar com o servidor 3CX. Confira a URL e se o PABX está acessível.',
            pbxUrl: conn.pbxUrl,
        };
    } finally {
        clearTimeout(timeout);
    }
}

/** Desconecta um PABX 3CX */
export async function disconnect3CX(organizationId: string, connectionId: string): Promise<void> {
    await delete3CXConnectionForOrg(organizationId, connectionId);
    logger.info({ organizationId, connectionId }, '[3cx] Conexão 3CX removida');
}

const MAKE_CALL_TIMEOUT_MS = 10_000;

/**
 * Dispara uma chamada via 3CX Click-to-Call / Call Control API.
 *
 * CORREÇÃO (achado de auditoria — mesma classe de bug do bloqueador #7 do AGENTS.md, "sistema não
 * pode afirmar que fez algo sem fazer de verdade"): esta função nunca chegou a fazer NENHUMA
 * chamada de rede para o PABX — gerava um `callId` fabricado e devolvia `success: true`
 * incondicionalmente, inclusive gravando no CRM uma Activity afirmando "Chamada iniciada via 3CX
 * PABX" mesmo com o PABX inalcançável ou o ramal inválido. Um vendedor via a UI dizer que ligou,
 * o CRM registrava a ligação como fato, e nenhuma chamada real acontecia — o cliente nunca era
 * discado.
 *
 * Agora faz uma tentativa real de HTTP contra o PABX, no mesmo padrão (timeout via
 * AbortController, sucesso/falha honestos) já usado e testado em `test3CXConnection` acima —
 * inclusive o mesmo prefixo `/api/v1/...`. IMPORTANTE: o contrato exato da API de Call Control
 * deste PABX (`/api/v1/calls`, payload `{ from, to }`) não pôde ser validado contra um servidor
 * 3CX real nesta auditoria — se o endpoint real usar outro caminho/payload, esta chamada falhará
 * honestamente (erro reportado ao usuário) em vez de mentir. Antes de confiar nisto em produção,
 * validar o contrato real com a documentação do PABX do cliente (ver handoff
 * `.agents/handoffs/onda-1/06-para-01-persistencia-3cx.md` para o item relacionado de
 * persistência).
 */
export async function make3CXCall(
    organizationId: string,
    connectionId: string,
    destinationNumber: string,
    leadId?: string
): Promise<{ success: boolean; callId: string; status: string }> {
    const connections = await get3CXConnectionsForOrg(organizationId);
    const conn = connections.find((c) => c.id === connectionId) || connections[0];
    if (!conn) throw new AppError('Nenhum PABX 3CX conectado para esta organização.', 400);

    const cleanNumber = destinationNumber.replace(/\D/g, '');
    if (!cleanNumber || cleanNumber.length < 8) {
        throw new AppError('Número de destino inválido para chamada 3CX.', 400);
    }

    // Mesma lista interna de bloqueio usada pelo SDR de voz (birth-voice) — "um número suprimido
    // nunca é discado, por nenhum caminho" vale para qualquer forma de ligar deste produto, e o
    // Click-to-Call do 3CX era um caminho que nunca checava isto: um pedido de opt-out registrado
    // pela ligação de IA não impedia um vendedor humano de disparar outra chamada pelo 3CX para o
    // mesmo número minutos depois.
    //
    // `isSuppressed` também consulta o opt-out unificado entre canais (`OptOutRecord`) — leadId,
    // quando informado pela rota, é o casamento mais forte para pegar um opt-out feito por e-mail
    // (05) ou WhatsApp (06) do mesmo lead, mesmo que o número discado aqui não seja o mesmo em
    // comum. Não busca o e-mail do lead à parte: o Click-to-Call é uma ação de latência sensível de
    // um vendedor humano, e o casamento por leadId já cobre o caso central deste contrato.
    if (await isSuppressed(organizationId, destinationNumber, { leadId: leadId ?? null })) {
        throw new AppError('Número na lista interna de bloqueio (opt-out): a ligação não foi disparada.', 409);
    }

    const callId = `3cx-call-${Date.now()}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MAKE_CALL_TIMEOUT_MS);
    let dialSucceeded: boolean;
    let failureReason = '';
    try {
        const res = await fetch(`${conn.pbxUrl}/api/v1/calls`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: conn.extension, to: cleanNumber }),
            signal: controller.signal,
        });
        dialSucceeded = res.ok;
        if (!res.ok) failureReason = `PABX respondeu HTTP ${res.status}`;
    } catch (err) {
        dialSucceeded = false;
        failureReason = controller.signal.aborted ? 'timeout ao comunicar com o PABX' : 'falha de rede ao comunicar com o PABX';
        logger.warn({ err, organizationId, connectionId: conn.id }, '[3cx] Falha ao disparar chamada real');
    } finally {
        clearTimeout(timeout);
    }

    // Registra a atividade no CRM se leadId for fornecido — texto reflete o que REALMENTE
    // aconteceu (chamada disparada com sucesso vs. tentativa que falhou), nunca afirma uma
    // ligação que não ocorreu.
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
                    observations: dialSucceeded
                        ? `Chamada disparada via 3CX PABX (${conn.pbxUrl}) para o número ${destinationNumber}.`
                        : `Tentativa de chamada via 3CX PABX (${conn.pbxUrl}) para ${destinationNumber} FALHOU: ${failureReason}.`,
                },
            });
        } catch (err) {
            logger.warn({ err, leadId }, '[3cx] Não foi possível registrar a atividade de ligação no CRM');
        }
    }

    if (!dialSucceeded) {
        logger.warn({ organizationId, connectionId: conn.id, extension: conn.extension, destinationNumber, callId, failureReason }, '[3cx] Chamada NÃO foi disparada');
        throw new AppError(`Não foi possível disparar a chamada pelo PABX 3CX (${failureReason}).`, 502);
    }

    logger.info({ organizationId, connectionId: conn.id, extension: conn.extension, destinationNumber, callId }, '[3cx] Chamada disparada via 3CX PABX');

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
