// Trechos (lowercase) de nomes de ERP/TMS comuns no mercado logístico/transportador brasileiro —
// usados para um pequeno bônus de fit score quando a Apollo detecta um deles na empresa (ver
// computeFitScore). Comparamos por "contains" porque a Apollo devolve nomes de exibição livres
// (ex: "SAP Business One", "TOTVS Protheus"), não os UIDs usados como filtro de busca.
const LOGISTICS_RELEVANT_TECH_KEYWORDS = ['sap', 'protheus', 'sankhya', 'netsuite', 'totvs'];

// Categorias de carga com maior índice de roubo no Brasil, segundo a Associação Nacional do
// Transporte de Cargas e Logística (NTC) — citadas na Apresentação de Gerenciamento de Risco da
// Atlas como as "cargas mais roubadas no Brasil". Empresas que transportam esse tipo de carga são
// prioridade comercial real (maior exposição a sinistro = maior valor percebido do GR da Atlas).
const HIGH_THEFT_RISK_CARGO_KEYWORDS = [
    'aliment', 'bebida', 'eletroeletr', 'eletr', 'cigarro', 'tabaco', 'quimic', 'químic',
    'têxtil', 'textil', 'confec', 'autope', 'agric', 'agro', 'combust', 'petrol', 'higiene', 'limpeza',
];

export interface ScoreBreakdownItem {
    label: string;
    points: number;
    detail: string;
}

export interface FitScoreResult {
    score: number;
    temperature: 'Quente' | 'Morno' | 'Frio';
    breakdown: ScoreBreakdownItem[];
}

export interface FitScoreInput {
    situacaoCadastral?: string | null;
    capitalSocial?: number | null;
    employeeCountEstimate?: number | null;
    size?: string | null;
    cnaeDescription?: string | null;
    segmentKeywords?: string[];
    /** Segmento/indústria (ex: Apollo `industry`, ou o segmento do ICP) — usado junto com o CNAE para o bônus de carga de risco. */
    segment?: string | null;
    /** Cidade/UF real (pós-enriquecimento) — usado para o bônus de região de risco do playbook Atlas. */
    city?: string | null;
    state?: string | null;
    /** Faixa de frota selecionada no ICP (texto do dropdown) — usado para o bônus de frota do playbook Atlas. */
    fleetSizeHint?: string | null;
    /** UIDs de tecnologia detectados via Apollo Organization Enrich — usado para o bônus de ERP/TMS logístico. */
    technologies?: string[] | null;
}

/** Score de fit determinístico e auditável — cada critério é real (dado da Receita) e explicado. */
export function computeFitScore(input: FitScoreInput): FitScoreResult {
    const breakdown: ScoreBreakdownItem[] = [];
    let score = 0;

    if (input.situacaoCadastral) {
        if (input.situacaoCadastral.toUpperCase() === 'ATIVA') {
            score += 30;
            breakdown.push({ label: 'Situação cadastral', points: 30, detail: 'CNPJ ativo na Receita Federal' });
        } else {
            score -= 40;
            breakdown.push({
                label: 'Situação cadastral',
                points: -40,
                detail: `CNPJ com situação "${input.situacaoCadastral}" — risco alto`,
            });
        }
    }

    if (input.capitalSocial != null) {
        if (input.capitalSocial >= 100000) {
            score += 20;
            breakdown.push({ label: 'Capital social', points: 20, detail: 'Capital social >= R$ 100 mil' });
        } else if (input.capitalSocial >= 10000) {
            score += 10;
            breakdown.push({ label: 'Capital social', points: 10, detail: 'Capital social entre R$ 10 mil e R$ 100 mil' });
        } else {
            breakdown.push({ label: 'Capital social', points: 0, detail: 'Capital social baixo (< R$ 10 mil)' });
        }
    }

    if (input.employeeCountEstimate != null) {
        if (input.employeeCountEstimate >= 50) {
            score += 20;
            breakdown.push({ label: 'Porte estimado', points: 20, detail: 'Estimativa de 50+ funcionários' });
        } else if (input.employeeCountEstimate >= 10) {
            score += 12;
            breakdown.push({ label: 'Porte estimado', points: 12, detail: 'Estimativa de 10-49 funcionários' });
        } else {
            score += 5;
            breakdown.push({ label: 'Porte estimado', points: 5, detail: 'Estimativa de 1-9 funcionários' });
        }
    }

    if (input.segmentKeywords?.length && input.cnaeDescription) {
        const desc = input.cnaeDescription.toLowerCase();
        const matched = input.segmentKeywords.some((k) => desc.includes(k.toLowerCase()));
        if (matched) {
            score += 25;
            breakdown.push({ label: 'Aderência de CNAE ao ICP', points: 25, detail: `Atividade "${input.cnaeDescription}" combina com o segmento buscado` });
        } else {
            breakdown.push({ label: 'Aderência de CNAE ao ICP', points: 0, detail: `Atividade "${input.cnaeDescription}" não confirma o segmento buscado` });
        }
    }

    // Critérios de priorização do playbook comercial Atlas: frota acima de 50 veículos
    // e atuação em regiões de maior índice de roubo de carga (RJ e Grande SP).
    if (input.fleetSizeHint && /acima de 50|150-500|acima de 500/i.test(input.fleetSizeHint)) {
        score += 15;
        breakdown.push({ label: 'Frota (playbook Atlas)', points: 15, detail: 'Frota acima de 50 veículos — critério de priorização' });
    }

    const riskRegion = `${input.city || ''} ${input.state || ''}`.toUpperCase();
    if (input.state && /^(RJ|SP)$/.test(input.state.toUpperCase())) {
        score += 10;
        breakdown.push({ label: 'Região de risco (playbook Atlas)', points: 10, detail: `Atuação em ${riskRegion.trim()} — região com maior índice de roubo de carga` });
    }

    // Categoria de carga de maior risco de roubo (fonte: NTC, citada na Apresentação de
    // Gerenciamento de Risco da Atlas) — empresas nesses segmentos têm maior exposição a sinistro,
    // logo maior valor percebido na venda de GR.
    const cargoText = `${input.cnaeDescription || ''} ${input.segment || ''}`.toLowerCase();
    const matchedCargoRisk = HIGH_THEFT_RISK_CARGO_KEYWORDS.find((k) => cargoText.includes(k));
    if (matchedCargoRisk) {
        score += 10;
        breakdown.push({ label: 'Categoria de carga de risco (NTC)', points: 10, detail: `Atividade sugere transporte de carga com maior índice de roubo no Brasil` });
    }

    const relevantTech = (input.technologies || []).find((t) =>
        LOGISTICS_RELEVANT_TECH_KEYWORDS.some((k) => t.toLowerCase().includes(k))
    );
    if (relevantTech) {
        score += 5;
        breakdown.push({ label: 'Stack de ERP/TMS (Apollo)', points: 5, detail: `Usa "${relevantTech}" — indício de operação já digitalizada, mais fácil de integrar` });
    }

    score = Math.max(0, Math.min(100, score + 25)); // 25 pontos base de participação no funil

    const temperature: FitScoreResult['temperature'] = score >= 75 ? 'Quente' : score >= 45 ? 'Morno' : 'Frio';

    return { score, temperature, breakdown };
}
