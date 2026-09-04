import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { logger } from '../../lib/logger.js';

/**
 * Snapshot territorial RNTRC/ANTT compartilhado pela Prospecção.
 *
 * Este serviço vive em `src/shared/` porque rota, enriquecimento e componentes de Prospecção
 * consomem o mesmo indicador territorial. Manter o contrato compartilhado aqui evita importações
 * cruzadas entre features e preserva a regra `no-cross-feature-imports` do dependency-cruiser.
 * Os arquivos observados ficam em `public/data/rntrc/`, sem dependência do módulo aposentado de
 * Market Intelligence.
 */

export type RntrcTerritorialRow = {
  ibgeCode: string;
  name: string;
  uf: string;
  region: string;
  transporters: number;
  etc: number;
  tac: number;
  ctc: number;
  etcEquiparada: number;
};

type RntrcMetadata = {
  dataset: string;
  resource?: {
    id?: string;
    url?: string;
    competence?: string;
    last_modified?: string;
  };
  outputSha256?: string;
  sourcePage?: string;
};

export type RntrcTerritorialSnapshot = {
  rows: RntrcTerritorialRow[];
  byIbge: Map<string, RntrcTerritorialRow>;
  metadata: {
    dataset: string;
    competencia: string | null;
    sourceUrl: string | null;
    hash: string | null;
    granularity: 'MUNICIPAL';
    dataOrigin: 'OBSERVED';
  };
};

let cached: RntrcTerritorialSnapshot | null = null;

/**
 * Agrega o snapshot RNTRC municipal por UF para que a Prospecção possa exibir intensidade do
 * mercado de transporte rodoviário mesmo quando a empresa só tem UF/cidade e não código IBGE.
 *
 * Este indicador representa densidade de transportadores registrados no RNTRC/ANTT. Não deve ser
 * apresentado como índice de risco criminal, probabilidade de sinistro ou qualquer outra métrica
 * não presente no snapshot observado.
 */
export type RntrcRiskTier = 'ALTA' | 'MEDIA' | 'BAIXA';

export type RntrcUfRisk = {
  available: boolean;
  reason: string | null;
  uf: string | null;
  transporters: number | null;
  etc: number | null;
  tac: number | null;
  ctc: number | null;
  etcEquiparada: number | null;
  municipalitiesCount: number | null;
  /** Posição percentual (0-100) da UF entre todas as UFs com dado, pelo total de transportadores. */
  percentile: number | null;
  tier: RntrcRiskTier | null;
  metadata: RntrcTerritorialSnapshot['metadata'] | null;
};

function normalizeUf(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(trimmed) ? trimmed : null;
}

function tierFromPercentile(percentile: number): RntrcRiskTier {
  if (percentile >= 66) return 'ALTA';
  if (percentile >= 33) return 'MEDIA';
  return 'BAIXA';
}

function unavailable(
  reason: string,
  uf: string | null,
  metadata: RntrcTerritorialSnapshot['metadata'] | null,
): RntrcUfRisk {
  return {
    available: false,
    reason,
    uf,
    transporters: null,
    etc: null,
    tac: null,
    ctc: null,
    etcEquiparada: null,
    municipalitiesCount: null,
    percentile: null,
    tier: null,
    metadata,
  };
}

/**
 * Agrega o snapshot territorial (municipal) do RNTRC/ANTT por UF e devolve, para uma UF, o total
 * de transportadoras registradas e sua posição relativa (percentil) entre as demais UFs do
 * dataset. Puro em relação ao dataset: `rntrcTerritorialSnapshot()` é quem faz a única leitura de
 * disco (com cache), esta função só soma e ordena o que já foi carregado.
 */
export function rntrcRiskByUf(ufRaw: string | null | undefined): RntrcUfRisk {
  const uf = normalizeUf(ufRaw);
  const snapshot = rntrcTerritorialSnapshot();

  if (!uf)
    return unavailable(
      'UF não informada para esta empresa — não é possível localizar o indicador territorial.',
      null,
      snapshot.rows.length ? snapshot.metadata : null,
    );
  if (!snapshot.rows.length)
    return unavailable('Indicador territorial RNTRC (ANTT) indisponível no momento.', uf, null);

  const totals = new Map<
    string,
    {
      transporters: number;
      etc: number;
      tac: number;
      ctc: number;
      etcEquiparada: number;
      municipalities: number;
    }
  >();
  for (const row of snapshot.rows) {
    const current = totals.get(row.uf) ?? {
      transporters: 0,
      etc: 0,
      tac: 0,
      ctc: 0,
      etcEquiparada: 0,
      municipalities: 0,
    };
    current.transporters += row.transporters;
    current.etc += row.etc;
    current.tac += row.tac;
    current.ctc += row.ctc;
    current.etcEquiparada += row.etcEquiparada;
    current.municipalities += 1;
    totals.set(row.uf, current);
  }

  const target = totals.get(uf);
  if (!target)
    return unavailable(
      `Nenhum dado RNTRC (ANTT) publicado para ${uf} no snapshot atual.`,
      uf,
      snapshot.metadata,
    );

  const ranked = [...totals.entries()].sort((a, b) => a[1].transporters - b[1].transporters);
  const n = ranked.length;
  const index = ranked.findIndex(([key]) => key === uf);
  const percentile = n <= 1 ? 100 : Math.round((index / (n - 1)) * 100);

  return {
    available: true,
    reason: null,
    uf,
    transporters: target.transporters,
    etc: target.etc,
    tac: target.tac,
    ctc: target.ctc,
    etcEquiparada: target.etcEquiparada,
    municipalitiesCount: target.municipalities,
    percentile,
    tier: tierFromPercentile(percentile),
    metadata: snapshot.metadata,
  };
}

export function rntrcTerritorialSnapshot(): RntrcTerritorialSnapshot {
  if (cached) return cached;
  const base = resolve(process.cwd(), 'public', 'data', 'rntrc');
  try {
    const rows = JSON.parse(
      readFileSync(resolve(base, 'rntrc_municipios.json'), 'utf8'),
    ) as RntrcTerritorialRow[];
    const metadata = JSON.parse(
      readFileSync(resolve(base, 'rntrc_municipios.metadata.json'), 'utf8'),
    ) as RntrcMetadata;
    cached = {
      rows,
      byIbge: new Map(rows.map((row) => [row.ibgeCode, row])),
      metadata: {
        dataset: metadata.dataset,
        competencia: metadata.resource?.competence ?? null,
        sourceUrl: metadata.sourcePage ?? metadata.resource?.url ?? null,
        hash: metadata.outputSha256 ?? null,
        granularity: 'MUNICIPAL',
        dataOrigin: 'OBSERVED',
      },
    };
    return cached;
  } catch (error) {
    logger.warn(
      { event: 'rntrc_territorial_unavailable', error },
      'RNTRC territorial snapshot unavailable',
    );
    cached = {
      rows: [],
      byIbge: new Map(),
      metadata: {
        dataset: 'ANTT RNTRC',
        competencia: null,
        sourceUrl: null,
        hash: null,
        granularity: 'MUNICIPAL',
        dataOrigin: 'OBSERVED',
      },
    };
    return cached;
  }
}
