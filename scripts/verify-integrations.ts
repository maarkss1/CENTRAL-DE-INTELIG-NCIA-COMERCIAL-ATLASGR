import 'dotenv/config';
import { fetchApolloCandidates } from '../src/features/prospecting/services/apollo.service.js';
import { searchGooglePlacesCandidates } from '../src/features/prospecting/services/places.service.js';
import { getPaidProspectingKey } from '../src/config/prospecting-integrations.js';

type CheckResult = {
    ok: boolean;
    /** true quando a integração é opcional e não está configurada — não deve falhar o diagnóstico geral. */
    skipped?: boolean;
    detail: string;
};

const SKIPPED = (detail: string): CheckResult => ({ ok: true, skipped: true, detail });

async function verifyGooglePlaces(): Promise<CheckResult> {
    const candidates = await searchGooglePlacesCandidates(
        'transportadora em Ribeirão Preto, SP',
        1
    );
    return {
        ok: candidates.length > 0,
        detail: candidates.length > 0
            ? `${candidates.length} resultado recebido`
            : 'nenhum resultado; confira ativação, faturamento e restrições da chave',
    };
}

async function verifyApollo(): Promise<CheckResult> {
    if (!getPaidProspectingKey('APOLLO_API_KEY')) {
        return SKIPPED('APOLLO_API_KEY ausente ou PROSPECTING_PROVIDER_MODE != hybrid — provedor pago desativado por padrão');
    }
    const result = await fetchApolloCandidates(
        {
            segmento: 'Transporte e logística',
            localizacao: 'São Paulo',
            estado: 'São Paulo',
            quantidade: 1,
        },
        1
    );
    return {
        ok: result.candidates.length > 0,
        detail: result.candidates.length > 0
            ? `${result.candidates.length} resultado recebido`
            : result.error || 'nenhum resultado para a consulta mínima',
    };
}

/** Endpoint gratuito da Hunter.io — consulta o saldo da conta sem gastar créditos de busca. */
async function verifyHunter(): Promise<CheckResult> {
    const apiKey = getPaidProspectingKey('HUNTER_API_KEY');
    if (!apiKey) {
        return SKIPPED('HUNTER_API_KEY ausente ou PROSPECTING_PROVIDER_MODE != hybrid — provedor pago desativado por padrão');
    }
    try {
        const response = await fetch(`https://api.hunter.io/v2/account?api_key=${encodeURIComponent(apiKey)}`);
        if (!response.ok) return { ok: false, detail: `HTTP ${response.status}` };
        const data = (await response.json()) as { data?: { plan_name?: string; requests?: { searches?: { available?: number } } } };
        return {
            ok: true,
            detail: `plano ${data.data?.plan_name ?? 'desconhecido'}, ${data.data?.requests?.searches?.available ?? '?'} buscas disponíveis`,
        };
    } catch (error) {
        return { ok: false, detail: error instanceof Error ? error.message : 'falha de rede' };
    }
}

async function verifyBrasilApi(): Promise<CheckResult> {
    try {
        const response = await fetch(
            'https://brasilapi.com.br/api/cnpj/v1/00000000000191',
            {
                headers: {
                    'User-Agent': 'ProspectorAtlas/1.0',
                    Accept: 'application/json',
                },
            }
        );
        return {
            ok: response.ok,
            detail: response.ok ? 'consulta gratuita disponível' : `HTTP ${response.status}`,
        };
    } catch (error) {
        return {
            ok: false,
            detail: error instanceof Error ? error.message : 'falha de rede',
        };
    }
}

/** Testa a URL do webhook Bitrix24 salva no ambiente, sem gravar/alterar nada no portal. */
async function verifyBitrix(): Promise<CheckResult> {
    const webhookUrl = process.env.BITRIX24_WEBHOOK_URL?.trim();
    if (!webhookUrl) return SKIPPED('BITRIX24_WEBHOOK_URL não configurada');
    try {
        const url = webhookUrl.endsWith('/') ? webhookUrl : `${webhookUrl}/`;
        const response = await fetch(`${url}profile.json`);
        if (!response.ok) return { ok: false, detail: `HTTP ${response.status}` };
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!data || data.error) return { ok: false, detail: data?.error || 'resposta inesperada do portal' };
        return { ok: true, detail: `portal ${new URL(webhookUrl).hostname} respondeu` };
    } catch (error) {
        return { ok: false, detail: error instanceof Error ? error.message : 'falha de rede' };
    }
}

/** Lista modelos disponíveis — valida a chave sem gerar tokens/custo. */
async function verifyGroq(): Promise<CheckResult> {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) return SKIPPED('GROQ_API_KEY ausente');
    try {
        const response = await fetch('https://api.groq.com/openai/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        return { ok: response.ok, detail: response.ok ? 'chave válida' : `HTTP ${response.status}` };
    } catch (error) {
        return { ok: false, detail: error instanceof Error ? error.message : 'falha de rede' };
    }
}

async function verifyGemini(): Promise<CheckResult> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return SKIPPED('GEMINI_API_KEY ausente (caminho legado de embeddings)');
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
        );
        return { ok: response.ok, detail: response.ok ? 'chave válida' : `HTTP ${response.status}` };
    } catch (error) {
        return { ok: false, detail: error instanceof Error ? error.message : 'falha de rede' };
    }
}

async function verifyLiteLLM(): Promise<CheckResult> {
    const baseUrl = process.env.LITELLM_URL?.trim();
    if (!baseUrl) return SKIPPED('LITELLM_URL ausente — gateway principal de IA não configurado');
    try {
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}/health/liveliness`, {
            headers: process.env.LITELLM_KEY ? { Authorization: `Bearer ${process.env.LITELLM_KEY}` } : {},
        });
        return { ok: response.ok, detail: response.ok ? 'gateway respondendo' : `HTTP ${response.status}` };
    } catch (error) {
        return { ok: false, detail: error instanceof Error ? error.message : 'falha de rede' };
    }
}

async function verifyLangfuse(): Promise<CheckResult> {
    const baseUrl = process.env.LANGFUSE_BASEURL?.trim();
    if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY || !baseUrl) {
        return SKIPPED('LANGFUSE_PUBLIC_KEY/SECRET_KEY/BASEURL ausentes — tracing de observabilidade desativado');
    }
    try {
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/public/health`);
        return { ok: response.ok, detail: response.ok ? 'serviço saudável' : `HTTP ${response.status}` };
    } catch (error) {
        return { ok: false, detail: error instanceof Error ? error.message : 'falha de rede' };
    }
}

const results = {
    googlePlaces: await verifyGooglePlaces(),
    apollo: await verifyApollo(),
    hunter: await verifyHunter(),
    brasilApiCnpj: await verifyBrasilApi(),
    bitrix24: await verifyBitrix(),
    groq: await verifyGroq(),
    gemini: await verifyGemini(),
    litellm: await verifyLiteLLM(),
    langfuse: await verifyLangfuse(),
};

console.log(JSON.stringify(results, null, 2));

const failures = Object.entries(results).filter(([, result]) => !result.ok);
const skipped = Object.entries(results).filter(([, result]) => result.skipped);
if (skipped.length) {
    console.log(`\n${skipped.length} integração(ões) opcional(is) não configurada(s): ${skipped.map(([name]) => name).join(', ')}`);
}
if (failures.length) {
    console.log(`\n${failures.length} integração(ões) com falha: ${failures.map(([name]) => name).join(', ')}`);
}
process.exitCode = failures.length === 0 ? 0 : 1;
