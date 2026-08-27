import { randomUUID } from 'node:crypto';
import type { ThreeCXConnection } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { AppError } from '../../../shared/middlewares/errorHandler.js';
import { assertSafeWebhookUrl } from '../../../lib/adapters/crm/Bitrix24Adapter.js';
import { isSuppressed } from '../birth-voice/callSuppression.service.js';
import { requestContext } from '../../../lib/async-context.js';
import { classifyCallOutcome, callResultedInConversation, callMarker } from '../birth-voice/birthVoice.helpers.js';

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

    const connectionId = `3cx-${Date.now()}-${randomUUID().slice(0, 8)}`;
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
    leadId?: string,
    /** Opcional: e-mail do contato/lead, quando o chamador o tiver em mãos mesmo sem leadId
     *  resolvido — fortalece o casamento do opt-out unificado (ver comentário abaixo). Nunca
     *  obrigatório: um Click-to-Call continua funcionando só com telefone. */
    email?: string
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
    // `isSuppressed` já normaliza `destinationNumber` para `phoneE164` e consulta o opt-out
    // unificado (`OptOutRecord`) por ele independentemente de `leadId` estar presente — então um
    // Click-to-Call sem leadId (número digitado manualmente) NUNCA pulava a checagem por telefone.
    //
    // CORREÇÃO (gap real de auditoria): o que faltava era `email` — quando o vendedor dispara a
    // chamada a partir de um contato do CRM (formulário/UI) sem `leadId` resolvido, ou quando quer
    // reforçar o casamento mesmo tendo leadId (contato pode ter opinado por e-mail com um telefone
    // diferente do discado agora), o e-mail do contato agora também entra no contexto do opt-out
    // unificado — mesmo padrão de `SuppressionCheckContext` já usado pelo SDR de voz
    // (`callSuppression.service.ts`), sem duplicar a query: `isSuppressed`/`isOptedOut` já sabem
    // casar por leadId OU email OU phoneE164 (`PrismaOptOutRepository.findMatches`). leadId e email
    // são independentes um do outro — nenhum dos dois enfraquece a checagem por telefone que já
    // valia antes.
    if (await isSuppressed(organizationId, destinationNumber, { leadId: leadId ?? null, email: email ?? null })) {
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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// process3CXWebhook — persistência real do evento de chamada do 3CX Call Flow
//
// CORREÇÃO (achado de auditoria): esta função só fazia `logger.info({ payload })` (payload cru,
// que pode conter o telefone completo) e devolvia `{status:'processed'}` sem gravar nada — nenhum
// evento de chamada real (atendida, perdida, transferida) deixava rastro, nunca se associava a um
// Lead, e nenhuma Activity era criada. Mesmo padrão de honestidade já aplicado a
// `voiceResult.webhook.ts`/`birthVoice.webhook.ts`: tenant resolvido antes de qualquer query,
// idempotência por marcador, classificação honesta do resultado (`classifyCallOutcome`/
// `callResultedInConversation`, reaproveitados de `birthVoice.helpers.ts` — lógica pura, sem nada
// específico de voz), nunca logar o telefone completo.
//
// LACUNA REAL QUE PERMANECE (documentada, não inventada): o contrato exato do payload que o 3CX
// Call Flow envia nunca foi validado contra um servidor 3CX real (mesma ressalva já registrada em
// `make3CXCall` acima e nos handoffs `.agents/handoffs/onda-1/06-para-01-persistencia-3cx.md`,
// `.agents/handoffs/onda-7/06-para-12-3cx-webhook-persistencia.md` e
// `.agents/handoffs/onda-7/12-para-01-3cx-call-event-persistence.md`). O parser abaixo aceita um
// conjunto de nomes de campo plausíveis (e o formato mínimo já coberto por
// `tests/unit/features/integrations/threecx/threecx.routes.test.ts`: `event`/`extension`/`callId`)
// — se o PABX real usar outro vocabulário, os campos não reconhecidos ficam `null` e o evento é
// tratado com a informação que sobrar (nunca inventa um valor), preservado sempre em `rawPayload`.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Tipo mínimo de leitura devolvido por `prisma.organization.findMany({ select: { id: true } })`. */
interface OrgIdRow {
    id: string;
}

/** Limite de segurança para o scan cross-tenant abaixo — nunca deveria ser atingido em uso normal. */
const MAX_ORGS_SCAN_FOR_EXTENSION_MATCH = 5_000;

/**
 * Resolve a organização dona de um evento de webhook do 3CX a partir do ramal (`extension`) do
 * payload.
 *
 * Por que isto é um scan cross-tenant, e não um `findMany({ where: { extension } })` direto:
 * `THREECX_WEBHOOK_SECRET` é um segredo GLOBAL (uma env só, compartilhada por toda organização que
 * conecta um PABX 3CX) — uma assinatura válida não identifica, por si só, o tenant. A única pista
 * de tenant no payload é o ramal, cruzado com `ThreeCXConnection.extension`. Mas `ThreeCXConnection`
 * tem FORCE ROW LEVEL SECURITY cuja policy (migration `20260825120000_scope_rls_bypass_to_bootstrap_allowlist`)
 * exige `app.current_tenant_id = organizationId` — SEM cláusula de bypass (a versão original da
 * tabela tinha `OR app.bypass_rls = 'on'`; essa cláusula foi removida nessa migration, então nem
 * `requestContext.run({ bypassRls: true }, …)` resolveria isto hoje). E mesmo que a policy ainda
 * permitisse bypass, `ThreeCXConnection` não está em `BYPASS_RLS_ALLOWED_MODELS`
 * (`src/lib/prisma.ts`) — adicioná-la ali, ou reabrir a cláusula de bypass na policy via nova
 * migration, está fora do escopo de arquivos desta tarefa (`src/features/integrations/threecx/**`
 * apenas) e do que o AGENTS.md deste diretório autoriza ("Não pode: criar/editar migration").
 *
 * A forma correta e segura disponível dentro deste escopo: `Organization` está em
 * `BYPASS_RLS_ALLOWED_MODELS` (usada para o mesmo tipo de "descoberta de bootstrap" que
 * `followUp.worker.ts`/`cadenceRun.worker.ts` já fazem antes de saber qual tenant escopar) — listar
 * os ids de organização via bypass não expõe nenhum dado de `ThreeCXConnection` em si, e a busca
 * real do ramal em cada organização roda com RLS normal (sem bypass), escopada uma a uma pelo
 * tenant real. Nenhum `organizationId` é aceito sem ter sido confirmado por uma query que já rodava
 * dentro do contexto daquele mesmo tenant.
 *
 * Varre TODAS as organizações (sem early-exit) de propósito: parar no primeiro achado esconderia
 * uma ambiguidade real (dois tenants com o mesmo ramal) atrás de "resolvido" — e resolver o tenant
 * errado aqui é exatamente a classe de bug que o AGENTS.md trata como bloqueador de isolamento de
 * dados. Sem match: descarta. Mais de um match: descarta (nunca adivinha).
 *
 * CUSTO CONHECIDO, NÃO RESOLVIDO NESTA TAREFA: isto é uma query por organização a cada webhook
 * recebido — não escala para uma base grande de tenants. A correção arquitetural correta (mesmo
 * padrão já usado pelo webhook de entrada do Bitrix, `bitrix.webhook.ts`: um identificador de
 * conexão opaco no PATH da URL do webhook, uma por organização) exige mudança de rota + schema/
 * migration — fora do escopo desta tarefa (arquivos fora de `threecx/**`), documentado aqui como
 * gap real para o Agente 01/12 endereçarem.
 */
async function resolveConnectionByExtension(
    extension: string,
): Promise<{ organizationId: string; connection: ThreeCXConnection } | 'not-found' | 'ambiguous'> {
    const orgIds: OrgIdRow[] = await requestContext.run({ bypassRls: true }, () =>
        prisma.organization.findMany({ select: { id: true } }),
    );

    if (orgIds.length > MAX_ORGS_SCAN_FOR_EXTENSION_MATCH) {
        logger.error(
            { orgCount: orgIds.length },
            '[3cx] Número de organizações excede o limite de segurança do scan por ramal — evento descartado.',
        );
        return 'not-found';
    }

    const matches: { organizationId: string; connection: ThreeCXConnection }[] = [];
    for (const { id: organizationId } of orgIds) {
        const found = await requestContext.run({ tenantId: organizationId }, () =>
            prisma.threeCXConnection.findFirst({ where: { extension } }),
        );
        if (found) matches.push({ organizationId, connection: found });
    }

    if (matches.length === 0) return 'not-found';
    if (matches.length > 1) return 'ambiguous';
    return matches[0];
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
    return null;
}

function asBoolean(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return null;
}

/** Eventos de progresso de chamada (nomenclatura plausível, não confirmada) — nunca carregam
 * resultado final, então nunca viram Activity: só o rastro em `ThreeCXCallEvent` é gravado. */
const NON_TERMINAL_EVENT_TYPES = new Set([
    'ringing', 'ring', 'initiated', 'initiating', 'trying', 'progress', 'connecting', 'dialing', 'answered',
]);

function isUniqueConstraintViolation(err: unknown): boolean {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export interface ThreeCXWebhookResult {
    status: 'processed' | 'ignored' | 'discarded';
    reason?: string;
    organizationId?: string;
    leadId?: string | null;
    duplicate?: boolean;
}

/**
 * Processa webhooks de chamada recebidos do 3CX Call Flow / CRM Webhook.
 *
 * Nunca loga o payload cru nem o número de telefone completo (o payload pode carregar `from`/`to`)
 * — só ids (`callId`, `organizationId`, `leadId`, `connectionId`), mesmo padrão de
 * `voiceResult.webhook.ts` (linha ~118).
 */
export async function process3CXWebhook(payload: Record<string, unknown>): Promise<ThreeCXWebhookResult> {
    const eventType = asString(payload.event) ?? asString(payload.eventType) ?? asString(payload.type) ?? 'unknown';
    const extension = asString(payload.extension) ?? asString(payload.Extension) ?? asString(payload.dn) ?? asString(payload.DN);
    const callId = asString(payload.callId) ?? asString(payload.call_id) ?? asString(payload.CallId) ?? asString(payload.id);

    if (!extension) {
        // Fail-closed: sem ramal não há como resolver a organização com segurança nenhuma — nunca
        // adivinha (ver detecção de ambiguidade em resolveConnectionByExtension).
        logger.warn({ eventType, callId }, '[3cx] Webhook sem ramal (extension) — organização não pôde ser resolvida. Descartado.');
        return { status: 'discarded', reason: 'sem-extension' };
    }

    const resolved = await resolveConnectionByExtension(extension);
    if (resolved === 'not-found') {
        logger.warn({ eventType, callId, extension }, '[3cx] Nenhuma conexão 3CX cadastrada para este ramal — evento descartado.');
        return { status: 'discarded', reason: 'ramal-desconhecido' };
    }
    if (resolved === 'ambiguous') {
        logger.error(
            { eventType, callId, extension },
            '[3cx] Ramal ambíguo entre múltiplas organizações — evento descartado (nunca adivinha o tenant).',
        );
        return { status: 'discarded', reason: 'ramal-ambiguo' };
    }

    const { organizationId, connection } = resolved;

    return requestContext.run({ tenantId: organizationId }, async () => {
        // Idempotência do rastro de auditoria: reentrega do mesmo (organizationId, callId, eventType)
        // não duplica a linha. Só se aplica quando o PABX manda um callId — sem ele não há chave
        // para comparar (mesmo tratamento de "sem-id" já usado em birthVoice.webhook.ts).
        let alreadyRecorded = false;
        if (callId) {
            const existingEvent = await prisma.threeCXCallEvent.findFirst({
                where: { organizationId, callId, eventType },
                select: { id: true },
            });
            alreadyRecorded = existingEvent !== null;
        }

        if (!alreadyRecorded) {
            try {
                await prisma.threeCXCallEvent.create({
                    data: {
                        organizationId,
                        connectionId: connection.id,
                        extension,
                        callId,
                        eventType,
                        rawPayload: payload as unknown as Prisma.InputJsonValue,
                    },
                });
            } catch (err) {
                if (isUniqueConstraintViolation(err)) {
                    alreadyRecorded = true;
                } else {
                    throw err;
                }
            }
        }

        if (alreadyRecorded) {
            logger.info(
                { callId, organizationId, connectionId: connection.id },
                '[3cx] Evento de chamada já processado (reentrega) — ignorado.',
            );
            return { status: 'processed', duplicate: true, organizationId };
        }

        if (NON_TERMINAL_EVENT_TYPES.has(eventType.toLowerCase())) {
            // Evento intermediário (tocando, discando, etc.) — sem resultado final para registrar
            // ainda. O rastro de auditoria acima já foi gravado; nenhuma Activity é criada por um
            // evento que não representa o desfecho da chamada.
            logger.info({ eventType, callId, organizationId, connectionId: connection.id }, '[3cx] Evento intermediário de chamada recebido — sem resultado final ainda.');
            return { status: 'ignored', organizationId };
        }

        // Extração honesta do resultado — campos ausentes ficam null, nunca inventados.
        const disposition = asString(payload.disposition) ?? asString(payload.status) ?? asString(payload.reason) ?? asString(payload.result);
        const durationSeconds =
            asNumber(payload.durationSeconds) ?? asNumber(payload.duration) ?? asNumber(payload.call_duration) ?? asNumber(payload.talkTime);
        const machineDetected = asBoolean(payload.machineDetected) ?? asBoolean(payload.amd) ?? asBoolean(payload.voicemailDetected);
        const toNumber = asString(payload.to) ?? asString(payload.destination) ?? asString(payload.callee) ?? asString(payload.dialedNumber) ?? asString(payload.external_number);
        const fromNumber = asString(payload.from) ?? asString(payload.caller) ?? asString(payload.source);
        const explicitLeadId = asString(payload.leadId) ?? asString(payload.lead_id);

        // Descarta o próprio ramal da lista de candidatos a "número do lead" — numa chamada
        // originada/recebida por este PABX, um dos dois lados (from/to) é sempre o ramal interno.
        const extDigits = extension.replace(/\D/g, '');
        const candidateNumbers = [toNumber, fromNumber].filter(
            (n): n is string => !!n && n.replace(/\D/g, '') !== extDigits,
        );

        let lead = explicitLeadId
            ? await prisma.lead.findFirst({ where: { id: explicitLeadId, organizationId }, include: { contact: true } })
            : null;

        if (!lead) {
            for (const num of candidateNumbers) {
                const digits = num.replace(/\D/g, '');
                const pattern = digits.length >= 8 ? digits.slice(-8) : digits;
                if (!pattern) continue;
                lead = await prisma.lead.findFirst({
                    where: {
                        organizationId,
                        OR: [
                            { contact: { phone: { contains: pattern } } },
                            { contact: { whatsapp: { contains: pattern } } },
                        ],
                    },
                    include: { contact: true },
                });
                if (lead) break;
            }
        }

        if (!lead) {
            logger.info({ callId, organizationId, connectionId: connection.id }, '[3cx] Evento de chamada sem lead correspondente nesta organização.');
            return { status: 'processed', organizationId, leadId: null };
        }

        // Idempotência da Activity em si (além da idempotência do rastro de auditoria acima): o
        // mesmo callId nunca produz uma segunda nota, mesmo que o rastro de auditoria já exista por
        // outro motivo (ex.: dois eventos diferentes do mesmo call, ver NON_TERMINAL_EVENT_TYPES).
        if (callId) {
            const marker = callMarker(callId);
            const existingActivity = await prisma.activity.findFirst({
                where: { leadId: lead.id, observations: { contains: marker } },
            });
            if (existingActivity) {
                logger.info({ callId, organizationId, leadId: lead.id }, '[3cx] Atividade já registrada para esta chamada — reentrega ignorada.');
                return { status: 'processed', duplicate: true, organizationId, leadId: lead.id };
            }
        }

        // Estado honesto — reaproveita a classificação já usada pelo SDR de voz (birth-voice): AMD,
        // não-atendimento, ocupado, número inválido e falha nunca colapsam em "conversa". 3CX não
        // manda transcrição (é só telefonia), por isso `text: null` — a classificação aqui depende
        // só de disposition/duration/machineDetected, quando o payload real os expuser.
        const outcome = classifyCallOutcome({
            providerOutcome: disposition,
            machineDetected,
            durationSeconds,
            text: null,
        });
        const hadConversation = callResultedInConversation(outcome);

        const observations = [
            `Evento de chamada 3CX (${eventType}) via ramal ${extension}.`,
            disposition ? `Status informado pelo PABX: ${disposition}.` : null,
            typeof durationSeconds === 'number' ? `Duração: ${durationSeconds}s.` : null,
            `Estado classificado: ${outcome}.`,
            callId ? callMarker(callId) : null,
        ]
            .filter(Boolean)
            .join('\n');

        await prisma.activity.create({
            data: {
                organizationId,
                leadId: lead.id,
                type: 'Ligacao' as never,
                status: (hadConversation ? 'Concluida' : 'Cancelada') as never,
                owner: `3CX Ramal ${extension}`,
                date: new Date(),
                observations,
            },
        });

        // Nunca loga o telefone completo — só ids, mesmo padrão de voiceResult.webhook.ts:118.
        logger.info(
            { callId, organizationId, leadId: lead.id, connectionId: connection.id },
            '[3cx] Resultado da chamada registrado no lead.',
        );

        return { status: 'processed', organizationId, leadId: lead.id, duplicate: false };
    });
}
