"""Executa a importacao validada do catalogo CNPJ no PostgreSQL.

Credenciais nunca ficam neste arquivo: use DATABASE_URL/DIRECT_URL ou --database-url.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from import_companies import Psql, run_import  # noqa: E402


def run(manifest_path: Path, database_url: str, psql_bin: str) -> dict[str, object]:
    """Valida o snapshot, importa todas as UFs e publica o dataset."""
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Manifest nao encontrado: {manifest_path}")
    if not shutil.which(psql_bin) and not Path(psql_bin).is_file():
        raise FileNotFoundError(f"psql nao encontrado: {psql_bin}")

    print("=" * 60, flush=True)
    print("INICIANDO CARGA VALIDADA NO POSTGRESQL (27 UFs)", flush=True)
    print("=" * 60, flush=True)
    result = run_import(manifest_path.resolve(), Psql(psql_bin, database_url))
    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manifest",
        type=Path,
        default=os.getenv("MARKET_INTELLIGENCE_MANIFEST"),
        required=os.getenv("MARKET_INTELLIGENCE_MANIFEST") is None,
    )
    parser.add_argument(
        "--database-url",
        default=os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL"),
    )
    parser.add_argument("--psql", default=os.getenv("PSQL_BIN") or "psql")
    args = parser.parse_args()

    if not args.database_url:
        parser.error("configure DATABASE_URL/DIRECT_URL ou informe --database-url")

    run(args.manifest, args.database_url, args.psql)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
