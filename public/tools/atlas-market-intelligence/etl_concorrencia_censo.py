#!/usr/bin/env python3
"""Valida e materializa a cobertura do censo competitivo municipal Atlas GR.

O ETL não tenta descobrir concorrentes por conta própria. Ele protege a metodologia contra
um erro mais grave: marcar `CENSO_COMPLETO` apenas porque uma busca encontrou poucas empresas.

Entradas:
- concorrencia_seed_verificada.csv: presenças competitivas verificadas;
- concorrencia_censo_cobertura.csv: protocolo de pesquisa por município;
- data/municipios.json: geografia canônica IBGE.

Saídas:
- data/competicao_municipios.json;
- data/competicao_municipios.metadata.json.

Se qualquer requisito do protocolo estiver ausente, um `CENSO_COMPLETO` solicitado é rebaixado
para `PESQUISA_PARCIAL`. Ausência de concorrente nunca vira concorrência zero.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROTOCOL_VERSION = "competition-census-v1"
TRUE_VALUES = {"1", "true", "sim", "yes", "y", "s"}
REQUIRED_CHECKS = (
    "local_business_search",
    "national_provider_search",
    "primary_websites_reviewed",
    "business_registry_search",
    "maps_search",
    "negative_evidence_recorded",
)


def norm(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(char for char in text if not unicodedata.combining(char)).upper().strip()
    return re.sub(r"[^A-Z0-9]+", " ", text).strip()


def is_true(value: str | None) -> bool:
    return norm(value).lower() in TRUE_VALUES


def valid_iso_date(value: str | None) -> bool:
    if not value:
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def geography_indexes(municipios: list[dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], dict[tuple[str, str], dict[str, Any]]]:
    by_code = {str(row["ibgeCode"]): row for row in municipios}
    by_name = {(norm(row["uf"]), norm(row["name"])): row for row in municipios}
    return by_code, by_name


def resolve_geo(
    row: dict[str, str],
    by_code: dict[str, dict[str, Any]],
    by_name: dict[tuple[str, str], dict[str, Any]],
) -> dict[str, Any] | None:
    code = (row.get("ibge_code") or row.get("ibgeCode") or "").strip()
    if code and code in by_code:
        return by_code[code]
    return by_name.get((norm(row.get("uf")), norm(row.get("municipio"))))


def empty_metrics() -> dict[str, Any]:
    return {
        "censusStatus": "NAO_PESQUISADO",
        "verifiedPresences": 0,
        "directRiskManagement": 0,
        "tracking": 0,
        "monitoring": 0,
        "readyResponse": 0,
        "nationalRemoteCoverage": 0,
        "protocolVersion": None,
        "verifiedAt": None,
        "confidence": "BAIXO",
        "blockers": [],
    }


def load_presences(
    path: Path,
    by_code: dict[str, dict[str, Any]],
    by_name: dict[tuple[str, str], dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], list[str]]:
    result: dict[str, dict[str, Any]] = {}
    unmatched: list[str] = []
    if not path.exists():
        return result, unmatched

    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        for index, row in enumerate(csv.DictReader(handle), start=2):
            geo = resolve_geo(row, by_code, by_name)
            if not geo:
                unmatched.append(f"linha {index}: {row.get('municipio', '')}/{row.get('uf', '')}")
                continue
            code = str(geo["ibgeCode"])
            entry = result.setdefault(code, empty_metrics())
            entry["censusStatus"] = "PESQUISA_PARCIAL"
            entry["verifiedPresences"] += 1

            category = norm(row.get("categoria"))
            if category in {"GERENCIADORA GR", "GERENCIAMENTO DE RISCO", "GR"}:
                entry["directRiskManagement"] += 1
            elif category == "RASTREAMENTO":
                entry["tracking"] += 1

            # Não inferir monitoramento, pronta resposta ou cobertura nacional de campos livres.
            # Esses contadores só devem subir quando houver atributos estruturados e evidenciados.

    return result, unmatched


def apply_coverage(
    metrics: dict[str, dict[str, Any]],
    coverage_path: Path,
    by_code: dict[str, dict[str, Any]],
    by_name: dict[tuple[str, str], dict[str, Any]],
) -> tuple[list[str], int, int]:
    unmatched: list[str] = []
    requested_complete = 0
    accepted_complete = 0
    if not coverage_path.exists():
        return unmatched, requested_complete, accepted_complete

    with coverage_path.open("r", encoding="utf-8-sig", newline="") as handle:
        for index, row in enumerate(csv.DictReader(handle), start=2):
            geo = resolve_geo(row, by_code, by_name)
            if not geo:
                unmatched.append(f"linha {index}: {row.get('municipio', '')}/{row.get('uf', '')}")
                continue

            code = str(geo["ibgeCode"])
            entry = metrics.setdefault(code, empty_metrics())
            requested = norm(row.get("census_status")) == "CENSO COMPLETO"
            if requested:
                requested_complete += 1

            blockers: list[str] = []
            if row.get("protocol_version") != PROTOCOL_VERSION:
                blockers.append(f"protocol_version deve ser {PROTOCOL_VERSION}")
            for field in REQUIRED_CHECKS:
                if not is_true(row.get(field)):
                    blockers.append(f"{field}=false/ausente")
            if not (row.get("reviewed_by") or "").strip():
                blockers.append("reviewed_by ausente")
            if not valid_iso_date(row.get("verified_at")):
                blockers.append("verified_at inválido/ausente")
            if norm(row.get("confidence")) != "ALTO":
                blockers.append("confidence deve ser ALTO para CENSO_COMPLETO")

            entry["protocolVersion"] = row.get("protocol_version") or None
            entry["verifiedAt"] = row.get("verified_at") or None
            entry["confidence"] = norm(row.get("confidence")) or "BAIXO"
            entry["blockers"] = blockers

            if requested and not blockers:
                entry["censusStatus"] = "CENSO_COMPLETO"
                accepted_complete += 1
            elif entry["verifiedPresences"] > 0 or any(is_true(row.get(field)) for field in REQUIRED_CHECKS):
                entry["censusStatus"] = "PESQUISA_PARCIAL"
            else:
                entry["censusStatus"] = "NAO_PESQUISADO"

    return unmatched, requested_complete, accepted_complete


def main() -> int:
    parser = argparse.ArgumentParser()
    base = Path("public/tools/atlas-market-intelligence")
    parser.add_argument("--municipios", type=Path, default=base / "data/municipios.json")
    parser.add_argument("--presences", type=Path, default=base / "concorrencia_seed_verificada.csv")
    parser.add_argument("--coverage", type=Path, default=base / "concorrencia_censo_cobertura.csv")
    parser.add_argument("--output", type=Path, default=base / "data/competicao_municipios.json")
    parser.add_argument("--metadata", type=Path, default=base / "data/competicao_municipios.metadata.json")
    args = parser.parse_args()

    municipios = json.loads(args.municipios.read_text(encoding="utf-8"))
    by_code, by_name = geography_indexes(municipios)
    metrics, unmatched_presences = load_presences(args.presences, by_code, by_name)
    unmatched_coverage, requested_complete, accepted_complete = apply_coverage(metrics, args.coverage, by_code, by_name)

    rows = []
    for code, entry in metrics.items():
        geo = by_code[code]
        rows.append({"ibgeCode": code, "name": geo["name"], "uf": geo["uf"], **entry})
    rows.sort(key=lambda row: (row["uf"], row["name"]))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    metadata = {
        "dataset": "Censo competitivo municipal Atlas GR",
        "processedAt": datetime.now(timezone.utc).isoformat(),
        "protocolVersion": PROTOCOL_VERSION,
        "records": len(rows),
        "censusComplete": sum(1 for row in rows if row["censusStatus"] == "CENSO_COMPLETO"),
        "partial": sum(1 for row in rows if row["censusStatus"] == "PESQUISA_PARCIAL"),
        "requestedComplete": requested_complete,
        "acceptedComplete": accepted_complete,
        "unmatchedPresences": unmatched_presences,
        "unmatchedCoverage": unmatched_coverage,
        "outputSha256": sha256_file(args.output),
        "rule": "CENSO_COMPLETO só é aceito com todos os checks do protocolo; caso contrário é rebaixado para PESQUISA_PARCIAL.",
    }
    args.metadata.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
