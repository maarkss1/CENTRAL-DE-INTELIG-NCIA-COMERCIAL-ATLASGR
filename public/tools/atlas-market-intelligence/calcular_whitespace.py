#!/usr/bin/env python3
"""White Space Calculator — Atlas Market Intelligence v0.4.

Fórmula (METODOLOGIA_WHITESPACE.md):
  White Space = 45% Demanda + 25% MDF-e + 30% (100 - Pressão Concorrencial)

  Demanda = 58% ICP + 42% RNTRC  (índices relativos 0–100)

Regra de inner join:
  Só classifica municípios com censusStatus == "CENSO_COMPLETO".
  Municípios sem censo permanecem como NAO_CLASSIFICADO.

Entradas:
  data/icp_municipios.json
  data/rntrc_municipios.json
  data/senatran_frota_municipios.json  (usado para validação de massa)
  data/mdfe_corredores.json            (fluxo)
  data/competicao_municipios.json      (pressão concorrencial)
  data/territorios.json                (territórios para enriquecimento)

Saídas:
  data/whitespace_municipios.json
  data/whitespace_municipios.metadata.json
  data/territorios.json  (atualizado com whiteSpaceScore por território)
"""
from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DATA_DIR = Path("data")

# Pesos conforme METODOLOGIA_WHITESPACE.md
W_DEMAND = 0.45
W_MDFE = 0.25
W_COMPETITION = 0.30
W_ICP_IN_DEMAND = 0.58
W_RNTRC_IN_DEMAND = 0.42


def sha256_file(path: Path) -> str:
    d = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            d.update(chunk)
    return d.hexdigest()


def load_json(path: Path) -> Any:
    if not path.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def log_scale(value: float | None, base: float = 10.0) -> float:
    """Transformação logarítmica para reduzir efeito de concentração extrema."""
    if value is None or value <= 0:
        return 0.0
    return math.log1p(value) / math.log(base)


def percentile_rank(values: list[float]) -> list[float]:
    """Retorna rank percentil 0–100 para cada valor (empates = rank médio)."""
    n = len(values)
    if n == 0:
        return []
    sorted_vals = sorted(set(values))
    rank_map: dict[float, float] = {}
    for rank, val in enumerate(sorted_vals):
        # Rank percentil: posição / (n_uniques - 1) × 100
        rank_map[val] = rank / max(len(sorted_vals) - 1, 1) * 100
    return [rank_map[v] for v in values]


def build_icp_index(icp_list: list[dict]) -> dict[str, float]:
    """Extrai total de ICP por código IBGE."""
    idx: dict[str, float] = {}
    for row in icp_list:
        code = str(row.get("ibgeCode", ""))
        total = float(row.get("total", 0) or 0)
        if code:
            idx[code] = total
    return idx


def build_rntrc_index(rntrc_list: list[dict]) -> dict[str, float]:
    """Extrai total de transportadores ativos por código IBGE."""
    idx: dict[str, float] = {}
    for row in rntrc_list:
        code = str(row.get("ibgeCode", ""))
        transporters = float(row.get("transporters", 0) or 0)
        if code:
            idx[code] = transporters
    return idx


def build_mdfe_index(mdfe_list: list[dict]) -> dict[str, float]:
    """Extrai fluxo MDF-e (viagens) por código IBGE de origem."""
    idx: dict[str, float] = {}
    for row in mdfe_list:
        code = str(row.get("ibgeCode", "") or row.get("originIbgeCode", ""))
        trips = float(row.get("trips", 0) or 0)
        if code:
            idx[code] = idx.get(code, 0) + trips
    return idx


def build_competition_index(comp_list: list[dict]) -> dict[str, dict]:
    """Indexa dados de competição por código IBGE."""
    idx: dict[str, dict] = {}
    for row in comp_list:
        code = str(row.get("ibgeCode", ""))
        if code:
            idx[code] = row
    return idx


def compute_competition_score(row: dict) -> float:
    """Calcula pressão concorrencial bruta por município.
    
    Usa pesos da METODOLOGIA_WHITESPACE.md:
      GERENCIADORA_GR: 1.00
      RASTREAMENTO:    0.55
    """
    dm = float(row.get("directRiskManagement", 0) or 0)
    tr = float(row.get("tracking", 0) or 0)
    mo = float(row.get("monitoring", 0) or 0)
    rr = float(row.get("readyResponse", 0) or 0)
    nr = float(row.get("nationalRemoteCoverage", 0) or 0)
    
    raw = dm * 1.00 + tr * 0.55 + mo * 0.70 + rr * 0.50 + nr * 0.35
    return raw


def main() -> int:
    print("=== White Space Calculator v0.4 ===")

    # --- Carregar dados ---
    print("Carregando datasets...")
    icp_list = load_json(DATA_DIR / "icp_municipios.json")
    rntrc_list = load_json(DATA_DIR / "rntrc_municipios.json")
    comp_list = load_json(DATA_DIR / "competicao_municipios.json")

    # MDF-e: tentar origens e destinos; corredores é grande, usar versão menor
    mdfe_path_candidates = [
        DATA_DIR / "mdfe_origens_municipios.json",
        DATA_DIR / "mdfe_destinos_municipios.json",
        DATA_DIR / "mdfe_corredores.json",
    ]
    mdfe_list = []
    mdfe_source = "nenhum"
    for mdfe_path in mdfe_path_candidates:
        if mdfe_path.exists():
            print(f"  Usando MDF-e: {mdfe_path.name}")
            mdfe_list = load_json(mdfe_path)
            mdfe_source = mdfe_path.name
            break

    print(f"  ICP: {len(icp_list):,} municípios")
    print(f"  RNTRC: {len(rntrc_list):,} municípios")
    print(f"  Competição: {len(comp_list):,} municípios")
    print(f"  MDF-e: {len(mdfe_list):,} registros ({mdfe_source})")

    # --- Construir índices ---
    icp_idx = build_icp_index(icp_list)
    rntrc_idx = build_rntrc_index(rntrc_list)
    mdfe_idx = build_mdfe_index(mdfe_list)
    comp_idx = build_competition_index(comp_list)

    # --- Municípios com CENSO_COMPLETO ---
    complete_codes = {
        str(row.get("ibgeCode", ""))
        for row in comp_list
        if row.get("censusStatus") == "CENSO_COMPLETO"
    }
    print(f"  Municípios com CENSO_COMPLETO: {len(complete_codes)}")

    # Universo de municípios = união de ICP + RNTRC
    all_codes = set(icp_idx.keys()) | set(rntrc_idx.keys())
    print(f"  Universo total: {len(all_codes):,} municípios")

    # --- Calcular valores brutos ---
    icp_vals: dict[str, float] = {c: log_scale(icp_idx.get(c)) for c in all_codes}
    rntrc_vals: dict[str, float] = {c: log_scale(rntrc_idx.get(c)) for c in all_codes}
    mdfe_vals: dict[str, float] = {c: log_scale(mdfe_idx.get(c)) for c in all_codes}

    # Competição bruta (só para municípios com censo)
    comp_raw: dict[str, float] = {}
    for code in all_codes:
        comp_data = comp_idx.get(code)
        if comp_data and comp_data.get("censusStatus") in ("CENSO_COMPLETO", "PESQUISA_PARCIAL"):
            comp_raw[code] = compute_competition_score(comp_data)
        elif comp_data:
            comp_raw[code] = compute_competition_score(comp_data)
        # else: sem dado de concorrência → não classificável pelo inner join

    # --- Percentil nacional ---
    codes_list = list(all_codes)
    icp_pct = dict(zip(codes_list, percentile_rank([icp_vals[c] for c in codes_list])))
    rntrc_pct = dict(zip(codes_list, percentile_rank([rntrc_vals[c] for c in codes_list])))
    mdfe_pct = dict(zip(codes_list, percentile_rank([mdfe_vals[c] for c in codes_list])))

    # Percentil de concorrência (só para municípios com valor)
    comp_codes = list(comp_raw.keys())
    if comp_codes:
        comp_pct_vals = percentile_rank([comp_raw[c] for c in comp_codes])
        comp_pct = dict(zip(comp_codes, comp_pct_vals))
    else:
        comp_pct = {}

    # --- Calcular White Space ---
    rows_out: list[dict] = []
    classified = 0
    for code in codes_list:
        icp_p = icp_pct.get(code, 0.0)
        rntrc_p = rntrc_pct.get(code, 0.0)
        mdfe_p = mdfe_pct.get(code, 0.0)
        
        demand = W_ICP_IN_DEMAND * icp_p + W_RNTRC_IN_DEMAND * rntrc_p
        
        comp_data = comp_idx.get(code, {})
        census_status = comp_data.get("censusStatus", "NAO_PESQUISADO")
        
        if code in complete_codes and code in comp_pct:
            # Inner join: só classifica com CENSO_COMPLETO
            comp_p = comp_pct[code]
            white_space = W_DEMAND * demand + W_MDFE * mdfe_p + W_COMPETITION * (100 - comp_p)
            ws_status = "CLASSIFICADO"
            classified += 1
        else:
            # Sem censo: calcula demanda parcial para referência mas não classifica WS
            comp_p = comp_pct.get(code)
            white_space = None
            ws_status = "NAO_CLASSIFICADO" if census_status == "NAO_PESQUISADO" else "CENSO_PARCIAL"

        rows_out.append({
            "ibgeCode": code,
            "censusStatus": census_status,
            "wsStatus": ws_status,
            "whiteSpaceScore": round(white_space, 4) if white_space is not None else None,
            "demandScore": round(demand, 4),
            "icpPercentile": round(icp_p, 2),
            "rntrcPercentile": round(rntrc_p, 2),
            "mdfePercentile": round(mdfe_p, 2),
            "competitionPercentile": round(comp_p, 2) if comp_p is not None else None,
            "verifiedPresences": comp_data.get("verifiedPresences", 0),
        })

    rows_out.sort(key=lambda r: (r["whiteSpaceScore"] or -1), reverse=True)

    out_path = DATA_DIR / "whitespace_municipios.json"
    out_path.write_text(
        json.dumps(rows_out, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"\n  Classificados (CENSO_COMPLETO): {classified}")
    print(f"  Não classificados: {len(rows_out) - classified}")

    # --- Enriquecer territorios.json ---
    territorios_path = DATA_DIR / "territorios.json"
    if territorios_path.exists():
        territorios = load_json(territorios_path)
        ws_idx = {r["ibgeCode"]: r for r in rows_out}
        for t in territorios:
            codes = t.get("municipalityCodes", [])
            ws_scores = [
                ws_idx[c]["whiteSpaceScore"]
                for c in codes
                if c in ws_idx and ws_idx[c]["whiteSpaceScore"] is not None
            ]
            if ws_scores:
                t["whiteSpace"] = {
                    "score": round(sum(ws_scores) / len(ws_scores), 4),
                    "classifiedMunicipalities": len(ws_scores),
                    "totalMunicipalities": len(codes),
                    "coverage": round(len(ws_scores) / max(len(codes), 1), 4),
                    "status": "DISPONIVEL",
                }
            else:
                t["whiteSpace"] = {
                    "score": None,
                    "classifiedMunicipalities": 0,
                    "totalMunicipalities": len(codes),
                    "coverage": 0.0,
                    "status": "BLOQUEADO_SEM_CENSO",
                }
        territorios_path.write_text(
            json.dumps(territorios, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        print(f"  territorios.json atualizado com whiteSpace.")

    metadata = {
        "dataset": "White Space — Atlas Market Intelligence v0.4",
        "processedAt": datetime.now(timezone.utc).isoformat(),
        "formula": "45% Demanda (58% ICP + 42% RNTRC) + 25% MDF-e + 30% (100 - Pressão Concorrencial)",
        "innerJoinRule": "Apenas CENSO_COMPLETO é classificado. NAO_PESQUISADO e PESQUISA_PARCIAL ficam NAO_CLASSIFICADO.",
        "totalMunicipalities": len(rows_out),
        "classified": classified,
        "notClassified": len(rows_out) - classified,
        "mdfeSource": mdfe_source,
        "outputSha256": sha256_file(out_path),
    }
    meta_path = DATA_DIR / "whitespace_municipios.metadata.json"
    meta_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
