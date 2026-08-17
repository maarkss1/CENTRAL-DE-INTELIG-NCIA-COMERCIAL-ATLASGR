#!/usr/bin/env python3
"""ETL oficial ANTT RNTRC-Dados de Veículos -> agregado por UF.

O dicionário oficial da ANTT informa que o recurso público possui os campos:
Categoria do Transportador, Tipo de Veículo, UF do Veículo, Categoria,
Carroceria, Ano de Fabricação do Veículo e Quantidade.

A base NÃO possui RNTRC individual nem município. Portanto este ETL publica a
frota somente no nível UF. Qualquer consumo municipal deve tratá-la como
PROXY_UF e nunca como observação municipal.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from etl_rntrc_atlas import norm, sha256_file, sniff_csv

VALID_UFS = {
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
    "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
    "SP", "SE", "TO",
}


@dataclass
class FleetAgg:
    total: int = 0
    traction: int = 0
    implements: int = 0
    other_type: int = 0
    etc: int = 0
    etc_equiparada: int = 0
    tac: int = 0
    ctc: int = 0
    other_transporter_category: int = 0
    manufacture_year_weighted_sum: int = 0
    manufacture_year_quantity: int = 0


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
    headers: set[str], aliases: tuple[str, ...], tokens: tuple[str, ...], *, required: bool = True
) -> str | None:
    for alias in aliases:
        if alias in headers:
            return alias
    candidates = [header for header in headers if all(token in header for token in tokens)]
    if len(candidates) == 1:
        return candidates[0]
    if required:
        raise RuntimeError(
            f"Não foi possível resolver coluna aliases={aliases!r} tokens={tokens!r}. "
            f"Cabeçalhos observados: {sorted(headers)!r}"
        )
    return candidates[0] if len(candidates) == 1 else None


def parse_quantity(value: str) -> int | None:
    text = (value or "").strip().replace(".", "").replace(",", ".")
    try:
        number = float(text)
    except ValueError:
        return None
    if number < 0 or not number.is_integer():
        return None
    return int(number)


def classify_vehicle_type(value: str) -> str:
    normalized = norm(value)
    if normalized in {"TRACAO", "VEICULO DE TRACAO"} or "TRACAO" in normalized:
        return "traction"
    if normalized in {"IMPLEMENTO", "IMPLEMENTO RODOVIARIO"} or "IMPLEMENTO" in normalized:
        return "implement"
    return "other"


def classify_transporter(value: str) -> str:
    normalized = norm(value).replace(" - ", " ")
    if "EQUIPAR" in normalized:
        return "etc_equiparada"
    if normalized.startswith("ETC") or "EMPRESA DE TRANSPORTE" in normalized:
        return "etc"
    if normalized.startswith("TAC") or "AUTONOMO" in normalized:
        return "tac"
    if normalized.startswith("CTC") or "COOPERATIVA" in normalized:
        return "ctc"
    return "other"


def aggregate(path: Path) -> tuple[list[dict], dict, dict]:
    iterator = iter(normalized_reader(path))
    first = next(iterator, None)
    if first is None:
        raise RuntimeError("Arquivo RNTRC-Dados de Veículos vazio")

    headers = set(first)
    transporter_col = resolve_column(
        headers,
        ("categoria_do_transportador", "categoria_transportador"),
        ("categoria", "transportador"),
    )
    type_col = resolve_column(
        headers,
        ("tipo_de_veiculo", "tipo_do_veiculo", "tipo_veiculo"),
        ("tipo", "veiculo"),
    )
    uf_col = resolve_column(
        headers,
        ("uf_do_veiculo", "uf_veiculo", "uf"),
        ("uf", "veiculo"),
    )
    category_col = resolve_column(headers, ("categoria", "categoria_do_veiculo"), ("categoria",), required=False)
    body_col = resolve_column(headers, ("carroceria", "tipo_de_carroceria"), ("carroceria",), required=False)
    year_col = resolve_column(
        headers,
        ("ano_de_fabricacao_do_veiculo", "ano_fabricacao_do_veiculo", "ano_fabricacao"),
        ("ano", "fabricacao"),
        required=False,
    )
    quantity_col = resolve_column(headers, ("quantidade", "qtd", "qtde"), ("quantidade",))

    by_uf: dict[str, FleetAgg] = defaultdict(FleetAgg)
    vehicle_categories: Counter[str] = Counter()
    bodyworks: Counter[str] = Counter()
    stats = {
        "rows_processed": 0,
        "rows_valid": 0,
        "rows_invalid_uf": 0,
        "rows_invalid_quantity": 0,
        "quantity_total": 0,
        "quantity_other_vehicle_type": 0,
        "quantity_other_transporter_category": 0,
    }

    def consume(row: dict[str, str]) -> None:
        stats["rows_processed"] += 1
        uf = (row.get(uf_col) or "").upper().strip()
        if uf not in VALID_UFS:
            stats["rows_invalid_uf"] += 1
            return
        quantity = parse_quantity(row.get(quantity_col) or "")
        if quantity is None:
            stats["rows_invalid_quantity"] += 1
            return

        stats["rows_valid"] += 1
        stats["quantity_total"] += quantity
        agg = by_uf[uf]
        agg.total += quantity

        vehicle_type = classify_vehicle_type(row.get(type_col) or "")
        if vehicle_type == "traction":
            agg.traction += quantity
        elif vehicle_type == "implement":
            agg.implements += quantity
        else:
            agg.other_type += quantity
            stats["quantity_other_vehicle_type"] += quantity

        transporter = classify_transporter(row.get(transporter_col) or "")
        if transporter == "etc":
            agg.etc += quantity
        elif transporter == "etc_equiparada":
            agg.etc_equiparada += quantity
        elif transporter == "tac":
            agg.tac += quantity
        elif transporter == "ctc":
            agg.ctc += quantity
        else:
            agg.other_transporter_category += quantity
            stats["quantity_other_transporter_category"] += quantity

        if category_col:
            category = norm(row.get(category_col) or "NAO INFORMADO") or "NAO INFORMADO"
            vehicle_categories[category] += quantity
        if body_col:
            body = norm(row.get(body_col) or "NAO INFORMADO") or "NAO INFORMADO"
            bodyworks[body] += quantity
        if year_col:
            raw_year = (row.get(year_col) or "").strip()
            if raw_year.isdigit():
                year = int(raw_year)
                if 1900 <= year <= datetime.now(timezone.utc).year + 1:
                    agg.manufacture_year_weighted_sum += year * quantity
                    agg.manufacture_year_quantity += quantity

    consume(first)
    for row in iterator:
        consume(row)

    rows = []
    current_year = datetime.now(timezone.utc).year
    for uf, agg in sorted(by_uf.items()):
        avg_year = (
            agg.manufacture_year_weighted_sum / agg.manufacture_year_quantity
            if agg.manufacture_year_quantity
            else None
        )
        rows.append({
            "uf": uf,
            "geographyLevel": "UF",
            "fleetTotal": agg.total,
            "tractionVehicles": agg.traction,
            "implements": agg.implements,
            "otherVehicleType": agg.other_type,
            "fleetByTransporterCategory": {
                "ETC": agg.etc,
                "ETC_EQUIPARADA": agg.etc_equiparada,
                "TAC": agg.tac,
                "CTC": agg.ctc,
                "OTHER": agg.other_transporter_category,
            },
            "averageManufactureYear": round(avg_year, 1) if avg_year is not None else None,
            "estimatedAverageVehicleAgeYears": round(current_year - avg_year, 1) if avg_year is not None else None,
            "municipalUse": "PROXY_UF",
        })

    if not rows:
        raise RuntimeError("Agregação oficial de frota não produziu nenhuma UF")

    diagnostics = {
        "observedVehicleCategories": dict(vehicle_categories.most_common()),
        "observedBodyworks": dict(bodyworks.most_common()),
    }
    return rows, stats, diagnostics


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--vehicles", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("public/tools/atlas-market-intelligence/data/rntrc_frota_uf.json"))
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--competence", default="2026-07")
    parser.add_argument("--source-url")
    parser.add_argument("--dictionary-url")
    args = parser.parse_args()

    rows, stats, diagnostics = aggregate(args.vehicles)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    processed = max(stats["rows_processed"], 1)
    total = max(stats["quantity_total"], 1)
    invalid_row_rate = (stats["rows_invalid_uf"] + stats["rows_invalid_quantity"]) / processed
    unknown_type_rate = stats["quantity_other_vehicle_type"] / total
    unknown_transporter_rate = stats["quantity_other_transporter_category"] / total
    status = "ATUALIZADO" if invalid_row_rate <= 0.001 and unknown_type_rate <= 0.001 else "PARCIAL"

    metadata_path = args.metadata or args.output.with_suffix(".metadata.json")
    metadata = {
        "dataset": "ANTT RNTRC-Dados de Veículos",
        "competence": args.competence,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceUrl": args.source_url,
        "dictionaryUrl": args.dictionary_url,
        "geographyLevel": "UF",
        "municipalUse": "PROXY_UF",
        "rawSha256": sha256_file(args.vehicles),
        "rawBytes": args.vehicles.stat().st_size,
        "outputSha256": sha256_file(args.output),
        "health": status,
        "stats": stats,
        "qualityRates": {
            "invalidRowRate": invalid_row_rate,
            "unknownVehicleTypeRate": unknown_type_rate,
            "unknownTransporterCategoryRate": unknown_transporter_rate,
        },
        "diagnostics": diagnostics,
        "transformations": [
            "preserva a granularidade geográfica oficial UF",
            "soma o campo Quantidade por UF",
            "usa Tipo de Veículo oficial para separar Tração e Implemento",
            "agrega Categoria do Transportador em ETC, ETC Equiparada, TAC e CTC",
            "calcula ano médio ponderado pela Quantidade quando Ano de Fabricação está disponível",
            "marca qualquer consumo municipal como PROXY_UF",
        ],
        "limitations": [
            "o recurso público de veículos não contém município",
            "o recurso público de veículos não contém número RNTRC individual para join com transportadores",
            "frota por município não é observável a partir deste recurso e não deve ser inferida como fato",
        ],
    }
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))

    if status != "ATUALIZADO":
        print("AVISO: snapshot de frota permaneceu PARCIAL devido aos gates de qualidade.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
