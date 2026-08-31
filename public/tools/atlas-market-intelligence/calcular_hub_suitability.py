#!/usr/bin/env python3
"""Hub Suitability Calculator — Atlas Market Intelligence v1 (exploratório).

Materializa os 6 componentes da metodologia Hub Suitability v1 em percentil nacional
e calcula um score agregado EXPLORATÓRIO com pesos iguais para análise de sensibilidade.

Componentes (METODOLOGIA_HUB_SUITABILITY_V1.md):
  1. icpMateriality        → ICP próprio da cidade-base (maior = melhor)
  2. rntrcMateriality      → RNTRC próprio (maior = melhor)
  3. cargoFleetMateriality → Frota de carga SENATRAN (maior = melhor)
  4. urbanCentrality       → Hierarquia REGIC 2018 invertida (nível menor = melhor)
  5. roadAccessibility     → Distância ao polo REGIC (menor = melhor)
  6. airportAccessibility  → Distância ao aeródromo ANAC (menor = melhor)

Score agregado EXPLORATÓRIO:
  Pesos iguais (1/6 cada) — rotulado EXPLORATORIO_PESOS_IGUAIS.
  O score DEFINITIVO requer HubSuitabilityPolicy aprovada pela Atlas.

Entradas:
  data/icp_municipios.json
  data/rntrc_municipios.json
  data/senatran_frota_municipios.json
  data/ibge_regic_hierarquia.json      (gerado por etl_ibge_regic.py)
  data/ibge_regic_rotas.json           (gerado por etl_ibge_regic.py)
  data/anac_aerodromos_municipios.json (gerado por etl_anac_aerodromos.py)
  data/territorios.json                (territórios para enriquecimento)

Saídas:
  data/hub_suitability_municipios.json
  data/hub_suitability_territorios.json
  data/hub_suitability.metadata.json
  data/territorios.json  (atualizado com hubSuitability por território)
"""
from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DATA_DIR = Path("data")
POLICY_VERSION = "EXPLORATORIO_PESOS_IGUAIS_v1"
POLICY_WEIGHTS = {
    "icpMateriality": 1 / 6,
    "rntrcMateriality": 1 / 6,
    "cargoFleetMateriality": 1 / 6,
    "urbanCentrality": 1 / 6,
    "roadAccessibility": 1 / 6,
    "airportAccessibility": 1 / 6,
}


def load_json(path: Path) -> Any:
    if not path.exists():
        print(f"  AVISO: {path} não encontrado. Componente ficará NAO_DISPONIVEL.")
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_file(path: Path) -> str:
    d = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            d.update(chunk)
    return d.hexdigest()


def percentile_rank_ascending(values: list[float | None]) -> list[float | None]:
    """Percentil crescente: valor maior = percentil maior. None → None."""
    valid = [(i, v) for i, v in enumerate(values) if v is not None]
    if not valid:
        return [None] * len(values)
    sorted_vals = sorted(set(v for _, v in valid))
    rank_map = {v: i / max(len(sorted_vals) - 1, 1) * 100 for i, v in enumerate(sorted_vals)}
    result: list[float | None] = [None] * len(values)
    for i, v in valid:
        result[i] = rank_map[v]
    return result


def percentile_rank_descending(values: list[float | None]) -> list[float | None]:
    """Percentil decrescente: valor menor = percentil maior. None → None."""
    valid = [(i, v) for i, v in enumerate(values) if v is not None]
    if not valid:
        return [None] * len(values)
    sorted_vals = sorted(set(v for _, v in valid), reverse=True)
    rank_map = {v: i / max(len(sorted_vals) - 1, 1) * 100 for i, v in enumerate(sorted_vals)}
    result: list[float | None] = [None] * len(values)
    for i, v in valid:
        result[i] = rank_map[v]
    return result


def log_scale(v: float | None) -> float | None:
    if v is None or v < 0:
        return None
    return math.log1p(v)


def build_index(data: list[dict] | None, key_field: str = "ibgeCode") -> dict[str, dict]:
    if not data:
        return {}
    return {str(row.get(key_field, "")): row for row in data if row.get(key_field)}


def build_distance_index(rotas: list[dict] | None) -> dict[str, float]:
    """Para cada município, distância mínima ao polo REGIC."""
    if not rotas:
        return {}
    # Distância do município ao seu polo (orig → dest ou dest → orig)
    min_dist: dict[str, float] = {}
    for r in rotas:
        orig = str(r.get("origCode", ""))
        dist = r.get("distanceKm")
        if orig and dist is not None:
            try:
                d = float(dist)
                if orig not in min_dist or d < min_dist[orig]:
                    min_dist[orig] = d
            except (ValueError, TypeError):
                pass
    return min_dist


def main() -> int:
    print("=== Hub Suitability Calculator v1 ===")

    # --- Carregar dados ---
    icp_list = load_json(DATA_DIR / "icp_municipios.json") or []
    rntrc_list = load_json(DATA_DIR / "rntrc_municipios.json") or []
    senatran_list = load_json(DATA_DIR / "senatran_frota_municipios.json") or []
    regic_hier = load_json(DATA_DIR / "ibge_regic_hierarquia.json") or {}
    regic_rotas = load_json(DATA_DIR / "ibge_regic_rotas.json") or []
    anac_mun = load_json(DATA_DIR / "anac_aerodromos_municipios.json") or {}

    icp_idx = build_index(icp_list)
    rntrc_idx = build_index(rntrc_list)
    senatran_idx = build_index(senatran_list)
    regic_dist_idx = build_distance_index(regic_rotas)

    # Universo = união de ICP + RNTRC
    all_codes = list(set(icp_idx.keys()) | set(rntrc_idx.keys()))
    print(f"  Universo: {len(all_codes):,} municípios")

    # --- Coletar valores brutos ---
    icp_raw = [log_scale(float(icp_idx[c].get("total", 0) or 0)) if c in icp_idx else None for c in all_codes]
    rntrc_raw = [log_scale(float(rntrc_idx[c].get("transporters", 0) or 0)) if c in rntrc_idx else None for c in all_codes]

    # SENATRAN: soma de veículos de carga (tipo 3 = caminhão, 13 = semirreboque, etc.)
    senatran_raw = []
    for c in all_codes:
        row = senatran_idx.get(c, {})
        total = sum(
            float(row.get(k, 0) or 0)
            for k in ("caminhao", "semireboque", "reboque", "tratorRodas", "utilitario", "total")
            if k in row
        )
        senatran_raw.append(log_scale(total) if total > 0 else None)

    # REGIC hierarquia: ordinal 1–9 (1=mais alto), convertemos para mérica "inversa" → nível menor = melhor
    # Municípios sem REGIC ficam None
    regic_level_raw = []
    for c in all_codes:
        hier = regic_hier.get(c) or regic_hier.get(c[:6])  # tenta 7 ou 6 dígitos
        if hier and hier.get("regicLevel") is not None:
            regic_level_raw.append(float(hier["regicLevel"]))
        else:
            regic_level_raw.append(None)

    # REGIC distância ao polo
    regic_dist_raw = [regic_dist_idx.get(c) or regic_dist_idx.get(c[:6]) for c in all_codes]

    # ANAC distância ao aeródromo mais próximo
    anac_dist_raw = []
    for c in all_codes:
        anac = anac_mun.get(c)
        if anac and anac.get("distanceKm") is not None:
            anac_dist_raw.append(float(anac["distanceKm"]))
        else:
            anac_dist_raw.append(None)

    # --- Percentil nacional ---
    icp_pct = percentile_rank_ascending(icp_raw)
    rntrc_pct = percentile_rank_ascending(rntrc_raw)
    senatran_pct = percentile_rank_ascending(senatran_raw)
    urbanc_pct = percentile_rank_descending(regic_level_raw)   # menor nível = melhor
    road_pct = percentile_rank_descending(regic_dist_raw)       # menor distância = melhor
    airport_pct = percentile_rank_descending(anac_dist_raw)     # menor distância = melhor

    # --- Montar registros ---
    rows_out: list[dict] = []
    for i, code in enumerate(all_codes):
        components = {
            "icpMateriality": round(icp_pct[i], 2) if icp_pct[i] is not None else None,
            "rntrcMateriality": round(rntrc_pct[i], 2) if rntrc_pct[i] is not None else None,
            "cargoFleetMateriality": round(senatran_pct[i], 2) if senatran_pct[i] is not None else None,
            "urbanCentrality": round(urbanc_pct[i], 2) if urbanc_pct[i] is not None else None,
            "roadAccessibility": round(road_pct[i], 2) if road_pct[i] is not None else None,
            "airportAccessibility": round(airport_pct[i], 2) if airport_pct[i] is not None else None,
        }

        # Score exploratório com pesos iguais (só com os componentes disponíveis)
        available = [(k, v) for k, v in components.items() if v is not None]
        if available:
            total_weight = sum(POLICY_WEIGHTS[k] for k, _ in available)
            exploratory_score = sum(POLICY_WEIGHTS[k] * v for k, v in available) / total_weight if total_weight > 0 else None
        else:
            exploratory_score = None

        availability = "COMPLETO" if len(available) == 6 else f"PARCIAL_{len(available)}_DE_6"

        # Dados adicionais para contexto
        regic_info = regic_hier.get(code) or regic_hier.get(code[:6]) or {}
        anac_info = anac_mun.get(code) or {}
        icp_data = icp_idx.get(code, {})
        rntrc_data = rntrc_idx.get(code, {})

        rows_out.append({
            "ibgeCode": code,
            "components": components,
            "exploratoryScore": round(exploratory_score, 4) if exploratory_score is not None else None,
            "availability": availability,
            "policyVersion": POLICY_VERSION,
            "overall": None,  # Requer HubSuitabilityPolicy aprovada — ver METODOLOGIA_HUB_SUITABILITY_V1.md
            "overallAvailability": "NAO_DISPONIVEL_SEM_POLITICA",
            "rawData": {
                "icpTotal": float(icp_data.get("total", 0) or 0),
                "rntrcTransporters": float(rntrc_data.get("transporters", 0) or 0),
                "regicLevel": regic_info.get("regicLevel"),
                "regicLabel": regic_info.get("regicLabel"),
                "regicPoleName": regic_info.get("poleName"),
                "roadDistKm": regic_dist_raw[i],
                "airportDistKm": anac_dist_raw[i],
                "nearestAirport": anac_info.get("nearestAirportName"),
                "hasLocalAirport": anac_info.get("hasLocalAirport", False),
            },
        })

    rows_out.sort(key=lambda r: (r["exploratoryScore"] or -1), reverse=True)

    out_mun = DATA_DIR / "hub_suitability_municipios.json"
    out_mun.write_text(
        json.dumps(rows_out, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"  {len(rows_out):,} municípios processados.")
    complete = sum(1 for r in rows_out if r["availability"] == "COMPLETO")
    print(f"  Componentes completos (6/6): {complete:,}")

    # --- Dossiê dos territórios finalistas ---
    territorios_path = DATA_DIR / "territorios.json"
    hs_idx = {r["ibgeCode"]: r for r in rows_out}

    territory_dossiê: list[dict] = []
    if territorios_path.exists():
        territorios = json.loads(territorios_path.read_text(encoding="utf-8"))
        for t in territorios:
            base_code = str(t.get("baseIbgeCode", ""))
            hs = hs_idx.get(base_code)
            territory_entry = {
                "id": t.get("id"),
                "baseCity": t.get("baseCity"),
                "uf": t.get("uf"),
                "baseIbgeCode": base_code,
                "hubSuitability": hs if hs else {"availability": "NAO_DISPONIVEL"},
            }
            territory_dossiê.append(territory_entry)

            # Enriquecer territorios.json com resumo
            if hs:
                t["hubSuitability"] = {
                    "exploratoryScore": hs["exploratoryScore"],
                    "availability": hs["availability"],
                    "policyVersion": POLICY_VERSION,
                    "overall": None,
                    "overallAvailability": "NAO_DISPONIVEL_SEM_POLITICA",
                    "components": hs["components"],
                    "regicLevel": hs["rawData"].get("regicLevel"),
                    "regicLabel": hs["rawData"].get("regicLabel"),
                    "airportDistKm": hs["rawData"].get("airportDistKm"),
                    "nearestAirport": hs["rawData"].get("nearestAirport"),
                }
            else:
                t["hubSuitability"] = {
                    "exploratoryScore": None,
                    "availability": "NAO_DISPONIVEL",
                    "policyVersion": POLICY_VERSION,
                    "overall": None,
                    "overallAvailability": "NAO_DISPONIVEL_SEM_POLITICA",
                }

        territorios_path.write_text(
            json.dumps(territorios, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )

    out_terr = DATA_DIR / "hub_suitability_territorios.json"
    out_terr.write_text(
        json.dumps(territory_dossiê, ensure_ascii=False, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"  Dossiê de {len(territory_dossiê)} territórios salvo.")

    metadata = {
        "dataset": "Hub Suitability — Atlas Market Intelligence v1",
        "policyVersion": POLICY_VERSION,
        "policyNote": (
            "Score EXPLORATORIO com pesos iguais (1/6 cada componente) para análise de sensibilidade. "
            "O score DEFINITIVO (overall) requer HubSuitabilityPolicy aprovada pela Atlas — "
            "ver METODOLOGIA_HUB_SUITABILITY_V1.md seção 4."
        ),
        "processedAt": datetime.now(timezone.utc).isoformat(),
        "totalMunicipalities": len(rows_out),
        "completeComponents": complete,
        "regicVintage": "2018",
        "regicNote": "REGIC 2018. Evidência estrutural, não retrato mensal de 2026.",
        "outputSha256": sha256_file(out_mun),
    }
    meta_path = DATA_DIR / "hub_suitability.metadata.json"
    meta_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
