#!/usr/bin/env python3
"""Agrega os datasets municipais derivados em municipios_scored.json.

Junta icp_municipios.json (CNPJ/ICP), rntrc_municipios.json, municipios.json
(cadastro IBGE + centroide BCIM), senatran_frota_municipios.json e o seed de
concorrencia em uma unica lista de `MunicipalityRecord` -- o formato consumido
por `src/features/market-intelligence/domain/MarketIntelligence.ts` via
`marketIntelligence.data.ts`.

Formula de demanda (ICP): percentil nacional ponderado por tier
(peso A=3, B=2, C=1) -- decisao de metodologia validada explicitamente pelo
usuario nesta sessao, nao uma escolha arbitraria. O mesmo metodo de percentil
e aplicado ao RNTRC (transportadores) e ao MDF-e/CIOT (viagens de carga como
origem + destino) por consistencia -- mesma tecnica, fonte de dado diferente.

Componentes sem fonte processada ainda (risco Sinesp, White Space
competitivo, eficiencia territorial) permanecem `NAO_DISPONIVEL`/bloqueados --
o Opportunity Score de cada municipio so deixa de ser None quando TODOS os
componentes ponderados de `BASE_OPPORTUNITY_WEIGHTS` estiverem presentes
(mesma regra de `calculateOpportunityScore` em scoreEngine.ts, replicada aqui
em Python para congelar o score no snapshot -- os dois devem ser mantidos em
sincronia se a formula mudar).
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import unicodedata
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ICP_TIER_WEIGHTS = {"tierA": 3, "tierB": 2, "tierC": 1}

# Espelha BASE_OPPORTUNITY_WEIGHTS em scoreEngine.ts.
OPPORTUNITY_WEIGHTS = {
    "icp": 0.25,
    "rntrc": 0.20,
    "mdfe": 0.15,
    "need": 0.15,
    "whiteSpace": 0.20,
    "territorialEfficiency": 0.05,
}


def norm(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(char for char in text if not unicodedata.combining(char)).upper().strip()
    return re.sub(r"[^A-Z0-9]+", " ", text).strip()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def percentile_scores(weights: dict[str, float]) -> dict[str, float]:
    """Percentil 0-100 de cada chave em `weights`, por posicao no ranking nacional.

    Empates recebem o mesmo percentil (media das posicoes empatadas). Municipio
    com peso zero fica no percentil mais baixo, nunca em NAO_DISPONIVEL --
    "nao ter ICP observado" e diferente de "ter ICP baixo", mas aqui so entram
    municipios com o dataset de origem presente (ver `build_records`).
    """
    if not weights:
        return {}
    ordered = sorted(weights.items(), key=lambda item: item[1])
    n = len(ordered)
    result: dict[str, float] = {}
    i = 0
    while i < n:
        j = i
        while j + 1 < n and ordered[j + 1][1] == ordered[i][1]:
            j += 1
        # posicoes i..j empatadas (0-based); percentil = posicao media / (n-1) * 100
        avg_rank = (i + j) / 2
        percentile = 0.0 if n == 1 else (avg_rank / (n - 1)) * 100
        for k in range(i, j + 1):
            result[ordered[k][0]] = round(percentile, 4)
        i = j + 1
    return result


@dataclass
class ScoreComponent:
    value: float | None
    confidence: float
    availability: str
    reason: str | None = None

    def to_json(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"value": self.value, "confidence": self.confidence, "availability": self.availability}
        if self.reason:
            payload["reason"] = self.reason
        return payload


NAO_DISPONIVEL = lambda reason: ScoreComponent(None, 0.0, "NAO_DISPONIVEL", reason)  # noqa: E731


def geometric_confidence(components: list[tuple[float, float]]) -> float:
    """weight, confidence -> media geometrica ponderada. Espelha geometricConfidence em scoreEngine.ts."""
    active = [(w, c) for w, c in components if w > 0]
    if not active:
        return 0.0
    total_weight = sum(w for w, _ in active)
    if total_weight <= 0:
        return 0.0
    if any(c <= 0 for _, c in active):
        return 0.0
    import math

    log_mean = sum((w / total_weight) * math.log(c) for w, c in active)
    return math.exp(log_mean)


def calculate_opportunity_score(inputs: dict[str, ScoreComponent]) -> dict[str, Any]:
    blocked_reasons: list[str] = []
    for key, weight in OPPORTUNITY_WEIGHTS.items():
        if weight <= 0:
            continue
        component = inputs[key]
        if component.value is None or not (0 <= component.value <= 100):
            blocked_reasons.append(f"{key}: NAO DISPONIVEL ou fora de 0-100")
        if not (0 <= component.confidence <= 1):
            blocked_reasons.append(f"{key}: confianca invalida")
    if blocked_reasons:
        return {"raw": None, "adjusted": None, "aggregateConfidence": 0.0, "blockedReasons": blocked_reasons}

    raw = sum(inputs[key].value * weight for key, weight in OPPORTUNITY_WEIGHTS.items())
    aggregate_confidence = geometric_confidence(
        [(weight, inputs[key].confidence) for key, weight in OPPORTUNITY_WEIGHTS.items()]
    )
    clamp = lambda v: max(0.0, min(100.0, v))  # noqa: E731
    return {
        "raw": clamp(raw),
        "adjusted": clamp(raw * aggregate_confidence),
        "aggregateConfidence": aggregate_confidence,
        "blockedReasons": [],
    }


def load_competition_seed(path: Path, ibge_by_name: dict[tuple[str, str], dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Le concorrencia_seed_verificada.csv e conta presencas verificadas por municipio IBGE.

    O seed so tem `municipio`/`uf`/`categoria`/`censo_status` -- nao ha colunas booleanas
    de tracking/monitoramento/pronta-resposta por linha, entao os contadores granulares
    de CompetitionMetrics ficam em 0 (nao inventados a partir de texto livre); apenas
    `verifiedPresences` e `censusStatus` refletem o que o seed realmente contem.
    """
    if not path.exists():
        return {}
    result: dict[str, dict[str, Any]] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            uf = norm(row.get("uf"))
            municipality = norm(row.get("municipio"))
            geo = ibge_by_name.get((uf, municipality))
            if not geo:
                continue
            code = geo["ibgeCode"]
            entry = result.setdefault(code, {"verifiedPresences": 0, "censusStatus": "PESQUISA_PARCIAL"})
            entry["verifiedPresences"] += 1
    return result


def index_by_ibge(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {row["ibgeCode"]: row for row in rows}


def build_records(
    municipios: list[dict[str, Any]],
    icp_by_code: dict[str, dict[str, Any]],
    rntrc_by_code: dict[str, dict[str, Any]],
    senatran_by_code: dict[str, dict[str, Any]],
    competition_by_code: dict[str, dict[str, Any]],
    mdfe_origins_by_code: dict[str, dict[str, Any]] | None = None,
    mdfe_destinations_by_code: dict[str, dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    mdfe_origins_by_code = mdfe_origins_by_code or {}
    mdfe_destinations_by_code = mdfe_destinations_by_code or {}

    icp_weighted = {
        code: sum(row.get(tier, 0) * weight for tier, weight in ICP_TIER_WEIGHTS.items())
        for code, row in icp_by_code.items()
    }
    icp_percentiles = percentile_scores(icp_weighted)

    rntrc_weighted = {code: row.get("transporters", 0) for code, row in rntrc_by_code.items()}
    rntrc_percentiles = percentile_scores(rntrc_weighted)

    mdfe_codes = set(mdfe_origins_by_code) | set(mdfe_destinations_by_code)
    mdfe_weighted = {
        code: (mdfe_origins_by_code.get(code, {}).get("trips") or 0) + (mdfe_destinations_by_code.get(code, {}).get("trips") or 0)
        for code in mdfe_codes
    }
    mdfe_percentiles = percentile_scores(mdfe_weighted)

    records: list[dict[str, Any]] = []
    stats = {"total": 0, "with_icp": 0, "with_rntrc": 0, "with_fleet": 0, "with_mdfe": 0, "with_competition_signal": 0}

    for muni in municipios:
        code = muni["ibgeCode"]
        stats["total"] += 1
        icp_row = icp_by_code.get(code)
        rntrc_row = rntrc_by_code.get(code)
        senatran_row = senatran_by_code.get(code)
        competition_row = competition_by_code.get(code)
        mdfe_origin_row = mdfe_origins_by_code.get(code)
        mdfe_destination_row = mdfe_destinations_by_code.get(code)

        if icp_row:
            stats["with_icp"] += 1
            demand = ScoreComponent(icp_percentiles.get(code, 0.0), 0.9, "OBSERVADO")
            icp_population = {
                "total": icp_row["total"], "tierA": icp_row["tierA"],
                "tierB": icp_row["tierB"], "tierC": icp_row["tierC"],
            }
        else:
            demand = NAO_DISPONIVEL("Municipio nao aparece no snapshot CNPJ/ICP processado.")
            icp_population = {"total": None, "tierA": None, "tierB": None, "tierC": None}

        if rntrc_row:
            stats["with_rntrc"] += 1
            rntrc_score = ScoreComponent(rntrc_percentiles.get(code, 0.0), 0.9, "OBSERVADO")
        else:
            rntrc_score = NAO_DISPONIVEL("Municipio sem transportadores RNTRC no snapshot.")

        fleet_traction = None
        fleet_implements = None
        if senatran_row:
            stats["with_fleet"] += 1
            by_type = senatran_row.get("byType", {})
            fleet_traction = by_type.get("CAMINHAO", 0) + by_type.get("CAMINHAO TRATOR", 0)
            fleet_implements = by_type.get("REBOQUE", 0) + by_type.get("SEMI REBOQUE", 0)

        rntrc_metrics = {
            "transporters": rntrc_row.get("transporters") if rntrc_row else None,
            "etc": rntrc_row.get("etc") if rntrc_row else None,
            "tac": rntrc_row.get("tac") if rntrc_row else None,
            "ctc": rntrc_row.get("ctc") if rntrc_row else None,
            "etcEquiparada": rntrc_row.get("etcEquiparada") if rntrc_row else None,
            # frota real por municipio (SENATRAN); tracao = auto-propelido, implemento = rebocado,
            # mesma distincao do dicionario ANTT que o campo foi originalmente desenhado para.
            "activeVehicles": senatran_row.get("cargoFleet") if senatran_row else None,
            "tractionVehicles": fleet_traction,
            "implements": fleet_implements,
        }

        census_status = competition_row["censusStatus"] if competition_row else "NAO_PESQUISADO"
        if competition_row:
            stats["with_competition_signal"] += 1
        competition_metrics = {
            "censusStatus": census_status,
            "verifiedPresences": competition_row["verifiedPresences"] if competition_row else 0,
            "directRiskManagement": 0,
            "tracking": 0,
            "monitoring": 0,
            "readyResponse": 0,
            "nationalRemoteCoverage": 0,
        }

        risk_component = NAO_DISPONIVEL("Base nacional de risco Sinesp ainda nao processada.")
        competition_pressure = NAO_DISPONIVEL(f"Censo de concorrencia em {census_status}, nao CENSO_COMPLETO.")
        white_space = NAO_DISPONIVEL(f"White Space bloqueado: concorrencia esta em {census_status}.")
        territorial_efficiency = NAO_DISPONIVEL("Formula de eficiencia territorial ainda nao definida (depende de malha viaria).")
        need_component = NAO_DISPONIVEL("Need depende do risco Sinesp, ainda nao processado.")

        mdfe_trips = None
        if code in mdfe_codes:
            stats["with_mdfe"] += 1
            origin_trips = (mdfe_origin_row or {}).get("trips") or 0
            destination_trips = (mdfe_destination_row or {}).get("trips") or 0
            mdfe_trips = origin_trips + destination_trips
            mdfe_component = ScoreComponent(mdfe_percentiles.get(code, 0.0), 0.85, "OBSERVADO")
        else:
            mdfe_component = NAO_DISPONIVEL("Municipio sem viagens CIOT/MDF-e no snapshot processado.")

        opportunity_inputs = {
            "icp": demand, "rntrc": rntrc_score, "mdfe": mdfe_component,
            "need": need_component, "whiteSpace": white_space, "territorialEfficiency": territorial_efficiency,
        }
        opportunity = calculate_opportunity_score(opportunity_inputs)
        raw_opportunity = ScoreComponent(opportunity["raw"], opportunity["aggregateConfidence"], "NAO_DISPONIVEL" if opportunity["raw"] is None else "OBSERVADO", "; ".join(opportunity["blockedReasons"]) or None)
        adjusted_opportunity = ScoreComponent(opportunity["adjusted"], opportunity["aggregateConfidence"], "NAO_DISPONIVEL" if opportunity["adjusted"] is None else "OBSERVADO", "; ".join(opportunity["blockedReasons"]) or None)

        evidence_ids = ["ibge-bcim"]
        if icp_row:
            evidence_ids.append("cnpj")
        if rntrc_row:
            evidence_ids.append("rntrc")
        if senatran_row:
            evidence_ids.append("senatran")
        if code in mdfe_codes:
            evidence_ids.append("mdfe-ciot")

        records.append({
            "ibgeCode": code, "name": muni["name"], "uf": muni["uf"], "region": muni["region"],
            "latitude": muni["latitude"], "longitude": muni["longitude"],
            "icp": icp_population,
            "rntrc": rntrc_metrics,
            # manifests/tonnes/tku permanecem null: a fonte (CIOT) mede operacoes contratadas,
            # nao manifestos, e nao publica peso/TKU por municipio -- ver FONTES.md.
            "mdfe": {"trips": mdfe_trips, "manifests": None, "tonnes": None, "tku": None, "interstateShare": None},
            "risk": {"cargoRobbery": None, "vehicleRobbery": None, "vehicleTheft": None, "geography": "NAO_DISPONIVEL"},
            "competition": competition_metrics,
            "scores": {
                "demand": demand.to_json(),
                "risk": risk_component.to_json(),
                "competitionPressure": competition_pressure.to_json(),
                "whiteSpace": white_space.to_json(),
                "territorialEfficiency": territorial_efficiency.to_json(),
                "rawOpportunity": raw_opportunity.to_json(),
                "confidenceAdjustedOpportunity": adjusted_opportunity.to_json(),
            },
            "economics": {
                "tamAccounts": icp_population["total"], "samAccounts": None, "somAccounts": None,
                "potentialMrr": None, "breakEvenContracts": None, "requiredPipeline": None,
            },
            "evidenceIds": evidence_ids,
        })

    records.sort(key=lambda row: (row["uf"], row["name"]))
    return records, stats


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=Path("public/tools/atlas-market-intelligence/data"))
    parser.add_argument("--concorrencia-seed", type=Path, default=Path("public/tools/atlas-market-intelligence/concorrencia_seed_verificada.csv"))
    parser.add_argument("--output", type=Path)
    parser.add_argument("--metadata", type=Path)
    args = parser.parse_args()

    output = args.output or (args.data_dir / "municipios_scored.json")
    metadata_path = args.metadata or output.with_suffix(".metadata.json")

    municipios = load_json(args.data_dir / "municipios.json")
    icp_by_code = index_by_ibge(load_json(args.data_dir / "icp_municipios.json"))
    rntrc_by_code = index_by_ibge(load_json(args.data_dir / "rntrc_municipios.json"))
    senatran_by_code = index_by_ibge(load_json(args.data_dir / "senatran_frota_municipios.json"))

    mdfe_origins_path = args.data_dir / "mdfe_origens_municipios.json"
    mdfe_destinations_path = args.data_dir / "mdfe_destinos_municipios.json"
    mdfe_origins_by_code = index_by_ibge(load_json(mdfe_origins_path)) if mdfe_origins_path.exists() else {}
    mdfe_destinations_by_code = index_by_ibge(load_json(mdfe_destinations_path)) if mdfe_destinations_path.exists() else {}

    ibge_by_name = {(norm(row["uf"]), norm(row["name"])): row for row in municipios}
    competition_by_code = load_competition_seed(args.concorrencia_seed, ibge_by_name)

    records, stats = build_records(
        municipios, icp_by_code, rntrc_by_code, senatran_by_code, competition_by_code,
        mdfe_origins_by_code, mdfe_destinations_by_code,
    )
    if not records:
        raise SystemExit("Agregacao municipal vazia")

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(records, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    has_mdfe = stats["with_mdfe"] > 0
    unavailable_components = ["risk", "need", "whiteSpace", "territorialEfficiency"]
    if not has_mdfe:
        unavailable_components.insert(0, "mdfe")

    metadata = {
        "dataset": "Agregado municipal (ICP + RNTRC + SENATRAN + MDF-e/CIOT + IBGE/BCIM + seed de concorrencia)",
        "processedAt": datetime.now(timezone.utc).isoformat(),
        "outputSha256": sha256_file(output),
        "stats": stats,
        "methodology": {
            "demandScore": "percentil nacional ponderado por tier ICP (A=3, B=2, C=1)",
            "rntrcScore": "percentil nacional da contagem de transportadores RNTRC ativos",
            "mdfeScore": "percentil nacional de viagens CIOT (origem + destino) por municipio, quando o dataset mdfe_*.json existe",
            "opportunityScore": "identico a calculateOpportunityScore em scoreEngine.ts (BASE_OPPORTUNITY_WEIGHTS); bloqueado ate risco Sinesp/White Space/eficiencia territorial existirem",
        },
        "unavailableComponents": unavailable_components,
        "transformations": [
            "join por codigo IBGE entre municipios.json, icp_municipios.json, rntrc_municipios.json, senatran_frota_municipios.json e mdfe_origens/destinos_municipios.json (quando presentes)",
            "join do seed de concorrencia por nome+UF (unico dataset sem codigo IBGE na fonte)",
            "frota SENATRAN reclassificada em tracao (CAMINHAO + CAMINHAO TRATOR) e implemento (REBOQUE + SEMI-REBOQUE), mesma distincao do dicionario ANTT",
            "opportunity score por municipio permanece bloqueado enquanto risco Sinesp e White Space nao existirem -- nunca estimado",
        ],
    }
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
