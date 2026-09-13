import { DEFAULT_PLAYBOOK, type PlaybookKey } from '../../../../config/playbooks.js';

// ACH-05-07: até 40 dos 100 pontos deste score vinham de critérios só relevantes ao playbook de
// risco de carga/logística (frota, região de roubo de carga, categoria de carga, stack de ERP/TMS
// do setor) e eram aplicados a QUALQUER organização, sem checar o playbook comercial ativo — CRM
// multi-tenant não pode amarrar o produto a um vertical (ver CLAUDE.md, seção 1). A chave abaixo é
// a mesma usada por `src/config/playbooks.ts`/`useActivePlaybook.ts` ('atlasgr' = "Logística &
// Risco"); os critérios de logística só entram quando o playbook ativo da organização é este.
const LOGISTICS_PLAYBOOK: PlaybookKey = 'atlasgr';

/**
 * `activePlaybook` é uma preferência hoje resolvida no navegador (ver `useActivePlaybook.ts`), não
 * um dado por organização persistido no backend — os call sites atuais de `computeFitScore`
 * (`enrichment.service.ts`, `fitScoreCalibration.ts`) ainda não têm como saber com certeza qual
 * playbook uma organização usa. Até essa lacuna ser fechada (persistir o playbook por
 * organização), o parâmetro é opcional e cai no padrão (`DEFAULT_PLAYBOOK` = 'atlasgr', o mesmo
 * playbook logístico usado hoje), preservando o comportamento atual para quem não o informa
 * explicitamente — mas já deixando de aplicar o bônus quando o chamador SABE que o playbook ativo
 * é outro (ex: 'totaltrac', telemetria de frota).
 */
function appliesLogisticsCriteria(input: Pick<FitScoreInput, 'activePlaybook'>): boolean {
  return (input.activePlaybook ?? DEFAULT_PLAYBOOK) === LOGISTICS_PLAYBOOK;
}

// Trechos (lowercase) de nomes de ERP/TMS e Telemetria/GR comuns no mercado logístico/transportador brasileiro —
// usados para um pequeno bônus de fit score quando a Apollo detecta um deles na empresa (ver
// computeFitScore). Comparamos por "contains" porque a Apollo devolve nomes de exibição livres
// (ex: "SAP Business One", "TOTVS Protheus", "Autotrac"), não os UIDs usados como filtro de busca.
// Só se aplica quando o playbook ativo é o de logística/risco de carga (ver appliesLogisticsCriteria).
const LOGISTICS_RELEVANT_TECH_KEYWORDS = [
  'sap',
  'protheus',
  'sankhya',
  'netsuite',
  'totvs',
  'autotrac',
  'sascar',
  'omnilink',
  'onixsat',
  'raster',
  'quattrus',
  'opentech',
  'buonny',
];

// Categorias de carga com maior índice de roubo no Brasil, segundo a Associação Nacional do
// Transporte de Cargas e Logística (NTC) — citadas na Apresentação de Gerenciamento de Risco da
// o playbook comercial como as "cargas mais roubadas no Brasil". Empresas que transportam esse tipo de carga são
// prioridade comercial real (maior exposição a sinistro = maior valor percebido do GR).
const HIGH_THEFT_RISK_CARGO_KEYWORDS = [
  'aliment',
  'bebida',
  'eletroeletr',
  'eletr',
  'cigarro',
  'tabaco',
  'quimic',
  'químic',
  'têxtil',
  'textil',
  'confec',
  'autope',
  'agric',
  'agro',
  'combust',
  'petrol',
  'higiene',
  'limpeza',
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
  /** Cidade/UF real (pós-enriquecimento) — usado para o bônus de região de risco do playbook comercial. */
  city?: string | null;
  state?: string | null;
  /** Faixa de frota selecionada no ICP (texto do dropdown) — usado para o bônus de frota do playbook comercial. */
  fleetSizeHint?: string | null;
  /** UIDs de tecnologia detectados via Apollo Organization Enrich — usado para o bônus de ERP/TMS logístico. */
  technologies?: string[] | null;
  /**
   * Playbook comercial ativo da organização (ver `src/config/playbooks.ts`). Os critérios de
   * frota, região de risco, categoria de carga e stack de ERP/TMS logístico (ACH-05-07) só se
   * aplicam quando este é o playbook de risco de carga/logística ('atlasgr') — omitir cai no
   * padrão (`DEFAULT_PLAYBOOK`), que é o mesmo valor, preservando o comportamento atual.
   */
  activePlaybook?: PlaybookKey;
}

/** Score de fit determinístico e auditável — cada critério é real (dado da Receita) e explicado. */
export function computeFitScore(input: FitScoreInput): FitScoreResult {
  const breakdown: ScoreBreakdownItem[] = [];
  let score = 0;

  if (input.situacaoCadastral) {
    if (input.situacaoCadastral.toUpperCase() === 'ATIVA') {
      score += 30;
      breakdown.push({
        label: 'Situação cadastral',
        points: 30,
        detail: 'CNPJ ativo na Receita Federal',
      });
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
      breakdown.push({
        label: 'Capital social',
        points: 20,
        detail: 'Capital social >= R$ 100 mil',
      });
    } else if (input.capitalSocial >= 10000) {
      score += 10;
      breakdown.push({
        label: 'Capital social',
        points: 10,
        detail: 'Capital social entre R$ 10 mil e R$ 100 mil',
      });
    } else {
      breakdown.push({
        label: 'Capital social',
        points: 0,
        detail: 'Capital social baixo (< R$ 10 mil)',
      });
    }
  }

  if (input.employeeCountEstimate != null) {
    if (input.employeeCountEstimate >= 50) {
      score += 20;
      breakdown.push({
        label: 'Porte estimado',
        points: 20,
        detail: 'Estimativa de 50+ funcionários',
      });
    } else if (input.employeeCountEstimate >= 10) {
      score += 12;
      breakdown.push({
        label: 'Porte estimado',
        points: 12,
        detail: 'Estimativa de 10-49 funcionários',
      });
    } else {
      score += 5;
      breakdown.push({
        label: 'Porte estimado',
        points: 5,
        detail: 'Estimativa de 1-9 funcionários',
      });
    }
  }

  if (input.segmentKeywords?.length && input.cnaeDescription) {
    const desc = input.cnaeDescription.toLowerCase();
    const matched = input.segmentKeywords.some((k) => desc.includes(k.toLowerCase()));
    if (matched) {
      score += 25;
      breakdown.push({
        label: 'Aderência de CNAE ao ICP',
        points: 25,
        detail: `Atividade "${input.cnaeDescription}" combina com o segmento buscado`,
      });
    } else {
      breakdown.push({
        label: 'Aderência de CNAE ao ICP',
        points: 0,
        detail: `Atividade "${input.cnaeDescription}" não confirma o segmento buscado`,
      });
    }
  }

  // ACH-05-07: os quatro critérios abaixo são específicos do playbook de risco de
  // carga/logística — só entram no score quando este é o playbook ativo da organização.
  if (appliesLogisticsCriteria(input)) {
    // Critérios de priorização do playbook comercial: frota acima de 50 veículos
    // e atuação em regiões de maior índice de roubo de carga (RJ e Grande SP).
    if (input.fleetSizeHint && /acima de 50|150-500|acima de 500/i.test(input.fleetSizeHint)) {
      score += 15;
      breakdown.push({
        label: 'Frota (playbook comercial)',
        points: 15,
        detail: 'Frota acima de 50 veículos — critério de priorização',
      });
    }

    const riskRegion = `${input.city || ''} ${input.state || ''}`.toUpperCase();
    if (input.state && /^(RJ|SP)$/.test(input.state.toUpperCase())) {
      score += 10;
      breakdown.push({
        label: 'Região de risco (playbook comercial)',
        points: 10,
        detail: `Atuação em ${riskRegion.trim()} — região com maior índice de roubo de carga`,
      });
    }

    // Categoria de carga de maior risco de roubo (fonte: NTC, citada na Apresentação de
    // Gerenciamento de Risco) — empresas nesses segmentos têm maior exposição a sinistro,
    // logo maior valor percebido na venda de GR.
    const cargoText = `${input.cnaeDescription || ''} ${input.segment || ''}`.toLowerCase();
    const matchedCargoRisk = HIGH_THEFT_RISK_CARGO_KEYWORDS.find((k) => cargoText.includes(k));
    if (matchedCargoRisk) {
      score += 10;
      breakdown.push({
        label: 'Categoria de carga de risco (NTC)',
        points: 10,
        detail: `Atividade sugere transporte de carga com maior índice de roubo no Brasil`,
      });
    }

    const relevantTech = (input.technologies || []).find((t) =>
      LOGISTICS_RELEVANT_TECH_KEYWORDS.some((k) => t.toLowerCase().includes(k)),
    );
    if (relevantTech) {
      score += 5;
      breakdown.push({
        label: 'Stack de ERP/TMS (Apollo)',
        points: 5,
        detail: `Usa "${relevantTech}" — indício de operação já digitalizada, mais fácil de integrar`,
      });
    }
  }

  score = Math.max(0, Math.min(100, score + 25)); // 25 pontos base de participação no funil

  const temperature: FitScoreResult['temperature'] =
    score >= 75 ? 'Quente' : score >= 45 ? 'Morno' : 'Frio';

  return { score, temperature, breakdown };
}
