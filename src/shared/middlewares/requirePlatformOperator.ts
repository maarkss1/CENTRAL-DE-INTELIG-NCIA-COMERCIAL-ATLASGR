import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';

const HEADER_NAME = 'x-platform-operator-token';
const QUERY_NAME = 'operator_token';
const COOKIE_NAME = 'platform_operator_token';
// Só o suficiente para não obrigar o operador a repassar o token em toda navegação dentro do
// BullBoard (que faz várias sub-requisições de AJAX sob /admin/queues/**) — curto o bastante para
// não virar uma sessão de longa duração paralela à do Better Auth.
const COOKIE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function timingSafeStringEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
}

// Este app não monta `cookie-parser` globalmente (`req.cookies` não existe) — em vez de adicionar
// uma dependência nova só para um único cookie de uso estreito, parseia o header `Cookie` cru.
function readRawCookie(req: Request, name: string): string | null {
    const header = req.headers.cookie;
    if (typeof header !== 'string') return null;
    for (const part of header.split(';')) {
        const separatorIndex = part.indexOf('=');
        if (separatorIndex === -1) continue;
        const key = part.slice(0, separatorIndex).trim();
        if (key !== name) continue;
        try {
            return decodeURIComponent(part.slice(separatorIndex + 1).trim());
        } catch {
            return null;
        }
    }
    return null;
}

/**
 * SEC-001/SEC-002 (Sprint 01/Onda 13) — segunda trava de acesso para superfícies de
 * infraestrutura compartilhada entre TODAS as organizações (BullBoard, `/metrics`), separada do
 * RBAC de negócio (papel ADMIN de uma organização). Um ADMIN de tenant não é automaticamente um
 * operador de infraestrutura — ver `docs/security/SECURITY_GUIDE.md`.
 *
 * Uso:
 *   - `/admin/queues`: compõe com `authenticateToken, requireTenant, requireRole(['ADMIN'])` —
 *     precisa das DUAS coisas (sessão ADMIN de tenant + token de operador).
 *   - `/metrics`: usa sozinho — não há conceito de sessão de usuário para um scraper Prometheus.
 *
 * Sem `PLATFORM_OPERATOR_TOKEN` configurado, nega por padrão (fail-closed) — não existe um "modo
 * aberto" quando o operador esquece de configurar o segredo.
 */
export function requirePlatformOperator(req: Request, res: Response, next: NextFunction): void {
    if (!env.PLATFORM_OPERATOR_TOKEN) {
        res.status(503).json({
            success: false,
            error: 'Recurso de operador de plataforma não habilitado — configure PLATFORM_OPERATOR_TOKEN.',
        });
        return;
    }

    const headerToken = req.headers[HEADER_NAME];
    const queryToken = req.query[QUERY_NAME];
    const cookieToken = readRawCookie(req, COOKIE_NAME);

    const candidate =
        (typeof headerToken === 'string' && headerToken) ||
        (typeof queryToken === 'string' && queryToken) ||
        (typeof cookieToken === 'string' && cookieToken) ||
        null;

    if (!candidate || !timingSafeStringEqual(candidate, env.PLATFORM_OPERATOR_TOKEN)) {
        res.status(403).json({ success: false, error: 'Acesso negado.' });
        return;
    }

    // Renova/seta o cookie só quando o token chegou por header ou query — evita reescrever o
    // cookie a cada requisição quando ele já é a própria fonte da validação.
    if (candidate !== cookieToken) {
        res.cookie(COOKIE_NAME, candidate, {
            httpOnly: true,
            secure: env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: COOKIE_MAX_AGE_MS,
        });
    }

    next();
}
