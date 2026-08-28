"""Gera .cache/market-intelligence/rntrc_by_cnpj.csv a partir do CSV oficial da ANTT/RNTRC.

Le o arquivo bruto validado por .codex-tools/validate-antt-rntrc.py, confirma a
integridade (tamanho + sha256) contra o metadata.json irmao, filtra apenas
documentos de 14 digitos que passam na validacao de CNPJ (modulo 11) e escreve
um CSV deduplicado por CNPJ pronto para scripts/market_intelligence/cross_rntrc.py
consumir via \\copy. Um metadata.json irmao do arquivo gerado documenta a
proveniencia (fonte, hash, competencia, contagens) - o arquivo anterior nesse
mesmo caminho foi descontinuado por nao ter esses metadados.
"""

from __future__ import annotations

import csv
import hashlib
import json
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent.parent
SOURCE = (
    PROJECT
    / ".cache"
    / "market-intelligence"
    / "sources"
    / "antt"
    / "rntrc"
    / "competencia-2026-07"
    / "transportadores_rntrc_07_2026.csv"
)
SOURCE_METADATA = SOURCE.with_name("metadata.json")
OUTPUT = PROJECT / ".cache" / "market-intelligence" / "rntrc_by_cnpj.csv"
OUTPUT_METADATA = OUTPUT.with_name("rntrc_by_cnpj.metadata.json")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def valid_cnpj(digits: str) -> bool:
    if len(digits) != 14 or digits == digits[0] * 14:
        return False

    def digit(base: str, weights: list[int]) -> str:
        remainder = sum(int(value) * weight for value, weight in zip(base, weights)) % 11
        return "0" if remainder < 2 else str(11 - remainder)

    first = digit(digits[:12], [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    second = digit(digits[:12] + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    return digits[-2:] == first + second


def main() -> int:
    if not SOURCE.is_file():
        raise FileNotFoundError(f"Arquivo ANTT nao encontrado: {SOURCE}")
    if not SOURCE_METADATA.is_file():
        raise FileNotFoundError(f"Metadata da fonte ANTT nao encontrado: {SOURCE_METADATA}")

    source_meta = json.loads(SOURCE_METADATA.read_text(encoding="utf-8"))

    actual_size = SOURCE.stat().st_size
    if actual_size != source_meta["bytes"]:
        raise RuntimeError(
            f"Tamanho divergente do arquivo ANTT: {actual_size}; esperado (metadata.json): {source_meta['bytes']}"
        )
    actual_sha256 = sha256_file(SOURCE)
    if actual_sha256 != source_meta["sha256"]:
        raise RuntimeError(
            f"SHA-256 divergente do arquivo ANTT: {actual_sha256}; esperado (metadata.json): {source_meta['sha256']}"
        )

    encoding = source_meta["encoding"]
    delimiter = source_meta["delimiter"]
    expected_fields = source_meta["fields"]

    rows_read = 0
    rows_written = 0
    skipped_non_cnpj = 0
    duplicate_cnpjs_seen = 0
    status_counts: Counter[str] = Counter()

    by_cnpj: dict[str, tuple[str, str, str]] = {}

    with SOURCE.open("r", encoding=encoding, newline="") as handle:
        reader = csv.DictReader(handle, delimiter=delimiter)
        fields = [field.strip() for field in (reader.fieldnames or [])]
        if fields != expected_fields:
            raise RuntimeError(f"Layout inesperado no CSV ANTT: {fields}")

        for row in reader:
            rows_read += 1
            digits = "".join(character for character in row["cpfcnpjtransportador"] if character.isdigit())
            if len(digits) != 14 or not valid_cnpj(digits):
                skipped_non_cnpj += 1
                continue

            status = row["situacao_rntrc"].strip().upper()
            number = row["numero_rntrc"].strip()
            category = row["categoria_transportador"].strip()

            if digits in by_cnpj:
                duplicate_cnpjs_seen += 1
                # Em caso de duplicidade futura (nao observada na competencia 2026-07),
                # prioriza o registro ATIVO sobre qualquer outra situacao.
                existing_status = by_cnpj[digits][1]
                if existing_status == "ATIVO" or status != "ATIVO":
                    continue

            by_cnpj[digits] = (number, status, category)

    for _, status, _ in by_cnpj.values():
        status_counts[status] += 1
    rows_written = len(by_cnpj)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["cnpj", "rntrcNumber", "rntrcStatus", "rntrcType"])
        for cnpj, (number, status, category) in sorted(by_cnpj.items()):
            writer.writerow([cnpj, number, status, category])

    output_meta = {
        "generatedBy": "scripts/market_intelligence/build_rntrc_by_cnpj.py",
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "source": {
            "file": str(SOURCE),
            "provenance": source_meta.get("provenance"),
            "resourceUrl": source_meta.get("resourceUrl"),
            "competencia": source_meta.get("competencia"),
            "bytes": source_meta["bytes"],
            "sha256": source_meta["sha256"],
        },
        "output": {
            "file": str(OUTPUT),
            "bytes": OUTPUT.stat().st_size,
            "sha256": sha256_file(OUTPUT),
        },
        "rowsReadFromSource": rows_read,
        "rowsWrittenToOutput": rows_written,
        "skippedNonCnpjRows": skipped_non_cnpj,
        "duplicateCnpjsResolved": duplicate_cnpjs_seen,
        "statusCounts": dict(status_counts),
    }
    OUTPUT_METADATA.write_text(json.dumps(output_meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(output_meta, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
