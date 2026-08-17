/**
 * Verificação estática de deriva estrutural entre `docs/openapi.yaml` e as rotas de negócio
 * realmente montadas em `server.ts`.
 *
 * Contexto (Onda 8, Agente 18 — Contratos, API e Documentação Viva): antes desta verificação,
 * nada checava se o documento OpenAPI ainda descrevia as rotas reais — a deriva medida no início
 * desta onda encontrou 6 routers de negócio inteiros (crm360, comercial-intelligence, lgpd, team,
 * bitrix, threecx) e ~13 endpoints avulsos existindo em código sem nenhuma linha de documentação.
 *
 * Escopo desta verificação (deliberado, não é a checagem completa de contrato): ela detecta
 * **prefixo de rota inteiro montado sem documentação correspondente**, e o inverso (caminho
 * documentado sem nenhum mount real). Ela NÃO valida método/parâmetro/corpo/status code por
 * endpoint — essa camada mais profunda depende de um servidor real rodando (ver `npm run
 * test:api-schema`, schemathesis contra `docs/openapi.yaml`, ainda não conectado ao CI — ver
 * `.agents/handoffs/onda-8/18-para-08-ci-openapi-drift.md`). Esta verificação estática não precisa
 * de servidor/Postgres/Redis, então roda em qualquer CI só com o checkout do repositório.
 *
 * Como funciona: extrai de `server.ts` todo mount HTTP de path literal (`app.use`/`app.get`/
 * `app.post`/... com uma string começando por `/`), filtra para os que começam com `/api`, e
 * calcula para cada um um "prefixo de recurso" (os segmentos do path até o primeiro segmento de
 * parâmetro, ex.: `/api/leads/:leadId/notes` → `leads`). Do lado do documento, cada `path:` do
 * OpenAPI é prefixado com `/api` (o `servers.url` do documento) e comparado pelo mesmo critério
 * (`/leads/{id}/enrich` → `leads`). Um prefixo de servidor sem NENHUM path documentado que o tenha
 * como prefixo de segmento é reportado como não documentado; um path documentado sem NENHUM
 * prefixo de servidor correspondente é reportado como documentação fantasma.
 */

export interface MountedRoute {
    /** Path literal exatamente como aparece no código-fonte, ex.: '/api/leads/:leadId/notes'. */
    path: string;
    /** Prefixo de recurso (segmentos antes do primeiro parâmetro), ex.: ['leads']. */
    resourceKey: string[];
}

export interface OpenApiDriftResult {
    /** Prefixos de recurso montados em server.ts sem nenhum path documentado que os cubra. */
    undocumentedPrefixes: string[];
    /** Paths documentados em openapi.yaml sem nenhum mount real de server.ts que os cubra. */
    phantomDocumentedPaths: string[];
    /** Todos os prefixos de recurso extraídos de server.ts (para relatório). */
    allMountedPrefixes: string[];
    /** Todos os paths extraídos de openapi.yaml (para relatório). */
    allDocumentedPaths: string[];
}

/**
 * Mounts que existem em `server.ts` mas nunca serão descritos como `paths` de OpenAPI — não são
 * recursos JSON REST comuns (HTML/texto/biblioteca de terceiros). Documentados em prosa no
 * `info.description` do YAML em vez de como `paths`. Ver também o comentário de cada um em
 * `server.ts`.
 */
const NON_REST_ALLOWLIST = new Set<string>([
    '', // '/api' — 404 catch-all de fim de cadeia, não é um router
    'metrics',
    'admin/queues',
]);

function splitSegments(path: string): string[] {
    return path.split('/').filter(Boolean);
}

/** `true` para segmentos de parâmetro nos dois estilos usados no repositório: `:id` (Express) e `{id}` (OpenAPI). */
function isParamSegment(segment: string): boolean {
    return segment.startsWith(':') || (segment.startsWith('{') && segment.endsWith('}'));
}

function resourceKeyFor(segments: string[]): string[] {
    const key: string[] = [];
    for (const segment of segments) {
        if (isParamSegment(segment)) break;
        key.push(segment);
    }
    return key;
}

/** Extrai todo mount HTTP de path literal em server.ts (app.use/app.get/app.post/app.put/app.patch/app.delete). */
export function extractMountedRoutes(serverTsSource: string): MountedRoute[] {
    const mountRegex = /app\.(?:use|get|post|put|patch|delete)\(\s*['"](\/[^'"]*)['"]/g;
    const routes: MountedRoute[] = [];
    const seen = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = mountRegex.exec(serverTsSource)) !== null) {
        const path = match[1];
        if (seen.has(path)) continue;
        seen.add(path);
        routes.push({ path, resourceKey: resourceKeyFor(splitSegments(path)) });
    }
    return routes;
}

/**
 * Reduz um prefixo de mount ao recurso de negócio comparável, descartando o prefixo `/api` e
 * mounts que não são "rotas de negócio" candidatas a documentação (health checks, docs, etc.).
 * Retorna `null` para mounts fora do universo `/api` (ex.: `/health/live`, `/api-docs`) — esses
 * nunca entram na comparação, em vez de precisar de allowlist individual.
 */
function businessResourceKey(route: MountedRoute): string[] | null {
    if (route.resourceKey[0] !== 'api') {
        if (route.path === '/api') return [];
        return null;
    }
    const rest = route.resourceKey.slice(1);
    return rest;
}

function extractDocumentedPathKeys(openapiPaths: Record<string, unknown>): Array<{ path: string; segments: string[] }> {
    return Object.keys(openapiPaths).map((docPath) => ({
        path: docPath,
        segments: splitSegments(`/api${docPath}`).slice(1), // remove o segmento 'api' também, mesma base do lado servidor
    }));
}

function isPrefixOf(prefix: string[], segments: string[]): boolean {
    if (prefix.length > segments.length) return false;
    return prefix.every((seg, i) => seg === segments[i]);
}

export function computeOpenApiDrift(serverTsSource: string, openapiPaths: Record<string, unknown>): OpenApiDriftResult {
    const mounted = extractMountedRoutes(serverTsSource);
    const serverKeys: string[][] = [];
    for (const route of mounted) {
        const key = businessResourceKey(route);
        if (key === null) continue;
        const keyId = key.join('/');
        if (NON_REST_ALLOWLIST.has(keyId)) continue;
        serverKeys.push(key);
    }

    const docEntries = extractDocumentedPathKeys(openapiPaths);

    const undocumentedPrefixes = new Set<string>();
    for (const key of serverKeys) {
        const covered = docEntries.some((doc) => isPrefixOf(key, doc.segments));
        if (!covered) undocumentedPrefixes.add(key.join('/'));
    }

    const phantomDocumentedPaths: string[] = [];
    for (const doc of docEntries) {
        const covered = serverKeys.some((key) => isPrefixOf(key, doc.segments));
        if (!covered) phantomDocumentedPaths.push(doc.path);
    }

    return {
        undocumentedPrefixes: [...undocumentedPrefixes].sort(),
        phantomDocumentedPaths: phantomDocumentedPaths.sort(),
        allMountedPrefixes: [...new Set(serverKeys.map((k) => k.join('/')))].sort(),
        allDocumentedPaths: docEntries.map((d) => d.path).sort(),
    };
}
