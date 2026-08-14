#!/usr/bin/env python3
"""ETL de frota RNTRC -> município IBGE para Atlas Market Intelligence.

A base pública de veículos da ANTT tem granularidade por veículo/transportador.
Este ETL não publica placas, documentos ou linhas brutas. Ele cruza o RNTRC do
veículo com o transportador ativo e publica somente contagens municipais.
"""
from __future__ import annotations

import argparse
import csv
import json
import sqlite3
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from etl_rntrc_atlas import is_active, load_ibge, norm, sha256_file, sniff_csv


@dataclass
class FleetAgg:
    total: int = 0
    traction: int = 0
    implements: int = 0
    other: int = 0


def normalized_reader(path: Path) -> Iterable[dict[str, str]]:
    encoding, delimiter = sniff_csv(path)
    with path.open("r", encoding=encoding, errors="replace", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=delimiter)
        for row in reader:
            yield {
                norm(key).replace(" ", "_").lower(): (value or "").strip()
                for key, value in row.items()
                if key
            }


def resolve_column(
    headers: set[str],
    aliases: tuple[str, ...],
    tokens: tuple[str, ...],
    *,
    required: bool = True,
) -> str | None:
    for alias in aliases:
        if alias in headers:
            return alias
    candidates = [header for header in headers if all(token in header for token in tokens)]
    if len(candidates) == 1:
        return candidates[0]
    if required:
        raise RuntimeError(
            f"Não foi possível resolver coluna lógica aliases={aliases!r} tokens={tokens!r}. "
            f"Cabeçalhos observados: {sorted(headers)!r}"
        )
    return candidates[0] if len(candidates) == 1 else None


def clean_rntrc(value: str) -> str:
    return "".join(char for char in (value or "") if char.isdigit())


def classify_vehicle(vehicle_type: str, bodywork: str) -> str:
    text = norm(f"{vehicle_type} {bodywork}")
    # Implementos não possuem unidade motriz própria. Mantemos a regra textual
    # explícita e auditável em vez de inferir por marca/modelo.
    if any(token in text for token in ("SEMI REBOQUE", "SEMIRREBOQUE", "REBOQUE", "DOLLY")):
        return "implement"
    if any(token in text for token in ("CAMINHAO", "CAMINHONETE", "UTILITARIO", "TRATOR", "AUTOMOTOR")):
        return "traction"
    return "other"


def build_transport_geography(
    transporters_path: Path,
    ibge: dict[tuple[str, str], dict],
    db: sqlite3.Connection,
) -> dict[str, int]:
    iterator = iter(normalized_reader(transporters_path))
    first = next(iterator, None)
    if first is None:
        raise RuntimeError("Arquivo RNTRC de transportadores vazio")

    headers = set(first)
    rntrc_col = resolve_column(
        headers,
        ("rntrc", "numero_rntrc", "num_rntrc", "registro_rntrc"),
        ("rntrc",),
    )
    municipality_col = resolve_column(
        headers,
        ("municipio", "nome_municipio", "municipio_transportador"),
        ("municipio",),
    )
    uf_col = resolve_column(headers, ("uf", "sg_uf", "sigla_uf"), ("uf",))
    status_col = resolve_column(
        headers,
        ("situacao_rntrc", "situacao", "status"),
        ("situacao",),
        required=False,
    )

    db.execute(
        "CREATE TABLE IF NOT EXISTS rntrc_geo (rntrc TEXT PRIMARY KEY, ibge_code TEXT NOT NULL) WITHOUT ROWID"
    )
    db.execute("DELETE FROM rntrc_geo")

    processed = active = matched_geo = missing_rntrc = unmatched_geo = 0

    def consume(row: dict[str, str]) -> None:
        nonlocal processed, active, matched_geo, missing_rntrc, unmatched_geo
        processed += 1
        if status_col and row.get(status_col) and not is_active(row[status_col]):
            return
        active += 1
        rntrc = clean_rntrc(row.get(rntrc_col) or "")
        if not rntrc:
            missing_rntrc += 1
            return
        uf = (row.get(uf_col) or "").upper().strip()
        municipality = row.get(municipality_col) or ""
        geo = ibge.get((uf, norm(municipality)))
        if not geo:
            unmatched_geo += 1
            return
        db.execute(
            "INSERT INTO rntrc_geo(rntrc, ibge_code) VALUES (?, ?) "
            "ON CONFLICT(rntrc) DO UPDATE SET ibge_code=excluded.ibge_code",
            (rntrc, geo["ibge_code"]),
        )
        matched_geo += 1

    consume(first)
    for row in iterator:
        consume(row)
    db.commit()
    return {
        "transporters_processed": processed,
        "transporters_active": active,
        "transporters_with_geo": matched_geo,
        "transporters_missing_rntrc": missing_rntrc,
        "transporters_unmatched_geo": unmatched_geo,
    }


def aggregate_vehicles(
    vehicles_path: Path,
    db: sqlite3.Connection,
) -> tuple[dict[str, FleetAgg], dict[str, int], Counter[str]]:
    iterator = iter(normalized_reader(vehicles_path))
    first = next(iterator, None)
    if first is None:
        raise RuntimeError("Arquivo RNTRC de veículos vazio")

    headers = set(first)
    rntrc_col = resolve_column(
        headers,
        ("rntrc", "numero_rntrc", "num_rntrc", "registro_rntrc"),
        ("rntrc",),
    )
    type_col = resolve_column(
        headers,
        ("tipo_veiculo", "descricao_tipo_veiculo", "tipo_do_veiculo"),
        ("tipo", "veiculo"),
        required=False,
    )
    body_col = resolve_column(
        headers,
        ("tipo_carroceria", "carroceria", "descricao_carroceria"),
        ("carroceria",),
        required=False,
    )
    if not type_col and not body_col:
        raise RuntimeError(
            "Base de veículos não possui coluna de tipo/carroceria reconhecível. "
            f"Cabeçalhos observados: {sorted(headers)!r}"
        )

    totals: dict[str, FleetAgg] = defaultdict(FleetAgg)
    type_counts: Counter[str] = Counter()
    processed = matched = missing_rntrc = unmatched_rntrc = unknown_class = 0

    lookup = db.cursor()

    def consume(row: dict[str, str]) -> None:
        nonlocal processed, matched, missing_rntrc, unmatched_rntrc, unknown_class
        processed += 1
        rntrc = clean_rntrc(row.get(rntrc_col) or "")
        if not rntrc:
            missing_rntrc += 1
            return
        found = lookup.execute("SELECT ibge_code FROM rntrc_geo WHERE rntrc=?", (rntrc,)).fetchone()
        if not found:
            unmatched_rntrc += 1
            return
        code = str(found[0])
        vehicle_type = row.get(type_col) if type_col else ""
        bodywork = row.get(body_col) if body_col else ""
        classification = classify_vehicle(vehicle_type or "", bodywork or "")
        normalized_type = norm(vehicle_type or bodywork or "NAO INFORMADO") or "NAO INFORMADO"
        type_counts[normalized_type] += 1

        agg = totals[code]
        agg.total += 1
        if classification == "traction":
            agg.traction += 1
        elif classification == "implement":
            agg.implements += 1
        else:
            agg.other += 1
            unknown_class += 1
        matched += 1

    consume(first)
    for row in iterator:
        consume(row)

    return totals, {
        "vehicles_processed": processed,
        "vehicles_matched_transporters": matched,
        "vehicles_missing_rntrc": missing_rntrc,
        "vehicles_unmatched_rntrc": unmatched_rntrc,
        "vehicles_other_classification": unknown_class,
    }, type_counts


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--transporters", type=Path, required=True)
    parser.add_argument("--vehicles", type=Path, required=True)
    parser.add_argument("--workdir", type=Path, default=Path(".cache/market-intelligence"))
    parser.add_argument("--ibge-json", type=Path)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("public/tools/atlas-market-intelligence/data/rntrc_frota_municipios.json"),
    )
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--transporters-competence", default="2026-07")
    parser.add_argument("--vehicles-competence")
    parser.add_argument("--vehicles-source-url")
    args = parser.parse_args()

    args.workdir.mkdir(parents=True, exist_ok=True)
    ibge, ibge_path = load_ibge(args.ibge_json, args.workdir)
    db_path = args.workdir / "rntrc_fleet_join.sqlite"
    db = sqlite3.connect(db_path)
    try:
        transport_stats = build_transport_geography(args.transporters, ibge, db)
        totals, vehicle_stats, type_counts = aggregate_vehicles(args.vehicles, db)
    finally:
        db.close()

    by_code = {geo["ibge_code"]: geo for geo in ibge.values()}
    rows = []
    for code, agg in totals.items():
        geo = by_code.get(code)
        if not geo:
            continue
        rows.append({
            "ibgeCode": code,
            "name": geo["municipality"],
            "uf": geo["uf"],
            "region": geo["region"],
            "fleetTotal": agg.total,
            "tractionVehicles": agg.traction,
            "implements": agg.implements,
            "otherVehicles": agg.other,
        })
    rows.sort(key=lambda row: (row["uf"], row["name"]))

    if not rows:
        raise RuntimeError("Agregação de frota não produziu nenhum município")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    metadata_path = args.metadata or args.output.with_suffix(".metadata.json")
    metadata = {
        "dataset": "ANTT RNTRC-Dados de Veículos",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "transportersCompetence": args.transporters_competence,
        "vehiclesCompetence": args.vehicles_competence,
        "vehiclesSourceUrl": args.vehicles_source_url,
        "transportersRawSha256": sha256_file(args.transporters),
        "vehiclesRawSha256": sha256_file(args.vehicles),
        "transportersRawBytes": args.transporters.stat().st_size,
        "vehiclesRawBytes": args.vehicles.stat().st_size,
        "outputSha256": sha256_file(args.output),
        "ibgeCache": str(ibge_path),
        "municipalitiesWithFleet": len(rows),
        "stats": {**transport_stats, **vehicle_stats},
        "observedVehicleTypes": dict(type_counts.most_common()),
        "classificationMethod": {
            "implement": ["SEMI REBOQUE", "SEMIRREBOQUE", "REBOQUE", "DOLLY"],
            "traction": ["CAMINHAO", "CAMINHONETE", "UTILITARIO", "TRATOR", "AUTOMOTOR"],
            "other": "qualquer tipo não coberto pelas regras anteriores; preservado separadamente, nunca redistribuído",
        },
        "transformations": [
            "transportador ativo -> município/UF -> código IBGE",
            "RNTRC do veículo -> RNTRC do transportador via SQLite temporário",
            "agregação municipal de frota total, veículos de tração, implementos e outros",
            "nenhuma placa, CPF/CNPJ ou identificador individual é publicado no dataset derivado",
        ],
    }
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))

    matched = max(vehicle_stats["vehicles_matched_transporters"], 1)
    unmatched_rate = vehicle_stats["vehicles_unmatched_rntrc"] / max(vehicle_stats["vehicles_processed"], 1)
    if unmatched_rate > 0.01:
        print(
            f"AVISO: {unmatched_rate:.2%} dos veículos não casaram com transportador; dataset deve permanecer PARCIAL.",
            file=sys.stderr,
        )
    other_rate = vehicle_stats["vehicles_other_classification"] / matched
    if other_rate > 0.05:
        print(
            f"AVISO: {other_rate:.2%} dos veículos ficaram em otherVehicles; revisar taxonomia antes de promover classificação.",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
