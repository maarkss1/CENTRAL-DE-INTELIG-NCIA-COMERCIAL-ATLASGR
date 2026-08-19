#!/usr/bin/env python3
"""Converte um snapshot CNPJ_COMPANIES em seed NDJSON pequeno e seguro para bootstrap.

O snapshot detalhado intermediario pode conter os campos publicos de contato do layout da Receita.
O catalogo global Atlas nao pode persisti-los nem versiona-los. Este builder remove os campos de
telefone/fax/e-mail ANTES de qualquer arquivo entrar no Git e produz partes gzip com hashes e
manifesto auditavel.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

CONTACT_FIELDS = {"ddd1", "telefone1", "ddd2", "telefone2", "dddFax", "fax", "email"}
JSON_FIELDS = {"cnaesSecundarios", "icpReasons"}
CNPJ_RE = re.compile(r"^[A-Z0-9]{12}[0-9]{2}$")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_snapshot(snapshot_dir: Path) -> dict[str, Any]:
    manifest_path = snapshot_dir / "manifest.json"
    if not manifest_path.is_file():
        raise RuntimeError(f"manifest.json ausente em {snapshot_dir}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("dataset") != "CNPJ_COMPANIES":
        raise RuntimeError("Snapshot de origem nao e CNPJ_COMPANIES")
    if not manifest.get("datasetHash") or not manifest.get("competencia"):
        raise RuntimeError("Snapshot sem datasetHash/competencia")
    return manifest


def source_rows(snapshot_dir: Path, manifest: dict[str, Any]) -> Iterator[dict[str, str]]:
    for entry in manifest.get("files") or []:
        rel = str(entry.get("path") or "")
        path = (snapshot_dir / rel).resolve()
        if snapshot_dir.resolve() not in path.parents or not path.is_file():
            raise RuntimeError(f"Particao invalida: {rel}")
        if sha256_file(path) != str(entry.get("sha256") or ""):
            raise RuntimeError(f"SHA-256 divergente na origem: {rel}")
        with gzip.open(path, "rt", encoding="utf-8", newline="") as handle:
            yield from csv.DictReader(handle)


def normalize_row(row: dict[str, str], municipality_ibge: str) -> dict[str, Any]:
    if row.get("municipioIbge") != municipality_ibge:
        raise RuntimeError(
            f"Seed recebeu municipio inesperado: {row.get('municipioIbge')!r}; esperado {municipality_ibge}"
        )
    cnpj = re.sub(r"[^A-Za-z0-9]", "", row.get("cnpj") or "").upper()
    if not CNPJ_RE.fullmatch(cnpj):
        raise RuntimeError(f"CNPJ fora do contrato alfanumerico: {cnpj!r}")

    safe: dict[str, Any] = {}
    for key, value in row.items():
        if key in CONTACT_FIELDS:
            continue
        value = value or ""
        if key in JSON_FIELDS:
            if not value:
                safe[key] = [] if key == "cnaesSecundarios" else None
            else:
                try:
                    safe[key] = json.loads(value)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(f"JSON invalido em {key} para {cnpj}") from exc
        else:
            safe[key] = value
    safe["cnpj"] = cnpj
    return safe


def write_seed(
    snapshot_dir: Path,
    output_dir: Path,
    municipality_ibge: str,
    chunk_size: int,
) -> dict[str, Any]:
    if not re.fullmatch(r"\d{7}", municipality_ibge):
        raise ValueError("municipality_ibge deve conter 7 digitos")
    if chunk_size < 100 or chunk_size > 100_000:
        raise ValueError("chunk_size deve ficar entre 100 e 100000")

    source_manifest = load_snapshot(snapshot_dir)
    source_filters = source_manifest.get("filters") or {}
    if source_filters.get("municipioIbge") not in (None, municipality_ibge):
        raise RuntimeError("Snapshot de origem foi gerado para outro municipio")

    output_dir.mkdir(parents=True, exist_ok=True)
    for stale in output_dir.glob("part-*.ndjson.gz"):
        stale.unlink()

    parts: list[dict[str, Any]] = []
    seen: set[str] = set()
    total = 0
    active = 0
    current_handle = None
    current_path: Path | None = None
    current_records = 0

    def close_part() -> None:
        nonlocal current_handle, current_path, current_records
        if current_handle is None or current_path is None:
            return
        current_handle.close()
        parts.append(
            {
                "path": current_path.name,
                "sha256": sha256_file(current_path),
                "records": current_records,
            }
        )
        current_handle = None
        current_path = None
        current_records = 0

    try:
        for raw in source_rows(snapshot_dir, source_manifest):
            row = normalize_row(raw, municipality_ibge)
            cnpj = str(row["cnpj"])
            if cnpj in seen:
                raise RuntimeError(f"CNPJ duplicado no seed: {cnpj}")
            seen.add(cnpj)

            if current_handle is None:
                current_path = output_dir / f"part-{len(parts) + 1:04d}.ndjson.gz"
                current_handle = gzip.open(current_path, "wt", encoding="utf-8", compresslevel=9)
            current_handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
            current_records += 1
            total += 1
            if row.get("situacaoCadastral") == "ATIVA":
                active += 1
            if current_records >= chunk_size:
                close_part()
    finally:
        close_part()

    if total <= 0:
        raise RuntimeError("Seed empresarial ficou vazio")

    seed_identity = json.dumps(
        {
            "sourceDatasetHash": source_manifest["datasetHash"],
            "competencia": source_manifest["competencia"],
            "municipioIbge": municipality_ibge,
            "parts": [{"sha256": part["sha256"], "records": part["records"]} for part in parts],
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    seed_hash = hashlib.sha256(seed_identity.encode("utf-8")).hexdigest()
    generated_at = datetime.now(timezone.utc).isoformat()
    manifest = {
        "dataset": "CNPJ_COMPANIES_SEED",
        "scope": "RIBEIRAO_PRETO_OPERATIONAL_BOOTSTRAP",
        "source": source_manifest.get("source") or "RECEITA_FEDERAL_CNPJ",
        "sourceUrl": source_manifest.get("sourceUrl"),
        "sourceVersion": source_manifest.get("sourceVersion") or source_manifest["competencia"],
        "competencia": source_manifest["competencia"],
        "pipelineVersion": "market-intelligence-company-seed-v1",
        "sourcePipelineVersion": source_manifest.get("pipelineVersion"),
        "sourceDatasetHash": source_manifest["datasetHash"],
        "seedHash": seed_hash,
        "generatedAt": generated_at,
        "filters": {
            "uf": "SP",
            "municipioIbge": municipality_ibge,
            "municipioNome": "Ribeirao Preto",
        },
        "records": total,
        "activeRecords": active,
        "parts": parts,
        "redaction": {
            "contactFieldsRemoved": sorted(CONTACT_FIELDS),
            "policy": "CATALOGO_GLOBAL_SEM_CONTATOS",
        },
        "dataOrigin": "OBSERVED",
        "limitations": [
            "ICP individual permanece NOT_AVAILABLE ate classificacao empresarial versionada.",
            "RNTRC individual permanece NOT_AVAILABLE; indicador municipal nao e atribuido ao CNPJ.",
        ],
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--municipality-ibge", default="3543402")
    parser.add_argument("--chunk-size", type=int, default=25_000)
    args = parser.parse_args()
    manifest = write_seed(
        args.snapshot_dir.resolve(), args.output_dir.resolve(), args.municipality_ibge, args.chunk_size
    )
    print(json.dumps({
        "seedHash": manifest["seedHash"],
        "competencia": manifest["competencia"],
        "records": manifest["records"],
        "activeRecords": manifest["activeRecords"],
        "parts": len(manifest["parts"]),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
