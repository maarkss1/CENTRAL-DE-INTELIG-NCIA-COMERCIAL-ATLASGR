import 'dotenv/config';
import { fetchApolloCandidates } from '../src/features/prospecting/services/apollo.service.js';
import { searchGooglePlacesCandidates } from '../src/features/prospecting/services/places.service.js';

type CheckResult = {
    ok: boolean;
    detail: string;
};

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

const results = {
    googlePlaces: await verifyGooglePlaces(),
    apollo: await verifyApollo(),
    brasilApiCnpj: await verifyBrasilApi(),
};

console.log(JSON.stringify(results, null, 2));
process.exitCode = Object.values(results).every((result) => result.ok) ? 0 : 1;
