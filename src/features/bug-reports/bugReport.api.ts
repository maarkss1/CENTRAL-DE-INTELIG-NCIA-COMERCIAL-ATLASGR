import { api } from '../../lib/api';
import { getRecentLogs } from '../../lib/clientLogger';

export type BugReportSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface CreateBugReportPayload {
    title: string;
    description: string;
    severity: BugReportSeverity;
    /** Marca ativa (atlasgr/totaltrac) no momento do relato — vem de useBrand(), não hardcoded
     *  aqui, para não acoplar este módulo genérico a um valor de marca específico. */
    brand?: string;
}

export interface CreateBugReportResult {
    id: string;
    status: string;
}

/** Monta o contexto técnico automático (URL, user agent, viewport, últimos logs) — o mesmo para
 *  todo relato, por isso vive aqui e não em cada chamador do botão. */
function buildContext(brand?: string) {
    return {
        url: window.location.href,
        route: window.location.pathname,
        brand,
        userAgent: navigator.userAgent,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        recentLogs: getRecentLogs(),
    };
}

export const bugReportApi = {
    create: (payload: CreateBugReportPayload) =>
        api.post<CreateBugReportResult>('/api/bug-reports', {
            title: payload.title,
            description: payload.description,
            severity: payload.severity,
            context: buildContext(payload.brand),
        }),
};
