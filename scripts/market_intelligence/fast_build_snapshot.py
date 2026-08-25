import os
import sys
import time
import json
import sqlite3
from pathlib import Path
from dataclasses import asdict

sys.path.insert(0, str(Path("public/tools/atlas-market-intelligence").resolve()))

import cnpj_company_pipeline
from cnpj_company_pipeline import (
    load_code_table,
    build_ibge_lookup,
    export_national,
    write_mapping_file,
    PartitionedCsvWriter,
    calculate_dataset_hash,
    PIPELINE_VERSION,
    SOURCE,
)

def run():
    started = time.time()
    competence = "2026-08"
    zips_dir = Path(".cache/market-intelligence/cnpj_zips")
    workdir = Path(".cache/market-intelligence/cnpj")
    output_root = Path(".cache/market-intelligence/normalized/companies")
    
    establishments = sorted(zips_dir.glob("Estabelecimentos*.zip"))
    companies = sorted(zips_dir.glob("Empresas*.zip"))
    simples = zips_dir / "Simples.zip"
    municipios = zips_dir / "Municipios.zip"
    cnaes = zips_dir / "Cnaes.zip"
    naturezas = zips_dir / "Naturezas.zip"
    qualificacoes = zips_dir / "Qualificacoes.zip"
    motivos = zips_dir / "Motivos.zip"
    ibge_file = workdir / "raw" / "ibge" / "municipios.json"

    print("Calculando dataset hash...")
    archives = [*establishments, *companies, simples, municipios, cnaes, naturezas, qualificacoes, motivos]
    dataset_hash = calculate_dataset_hash(competence, archives, None, None)
    print(f"Dataset Hash: {dataset_hash} (prefix: {dataset_hash[:16]})")

    snapshot_dir = output_root / f"competencia={competence}" / f"snapshot={dataset_hash[:16]}"
    manifest_path = snapshot_dir / "manifest.json"
    if manifest_path.exists():
        print(f"Snapshot ja existe em {snapshot_dir}!")
        return

    temp_dir = snapshot_dir.parent / f".tmp-{dataset_hash[:16]}-{os.getpid()}"
    if temp_dir.exists():
        import shutil
        shutil.rmtree(temp_dir)
    temp_dir.mkdir(parents=True, exist_ok=True)

    print("Carregando tabelas de referencia e IBGE...")
    municipios_dict = load_code_table(municipios)
    ibge_rows = json.loads(ibge_file.read_text(encoding="utf-8"))
    ibge = build_ibge_lookup(ibge_rows)
    lookups = {
        "cnaes": load_code_table(cnaes),
        "naturezas": load_code_table(naturezas),
        "qualificacoes": load_code_table(qualificacoes),
        "motivos": load_code_table(motivos),
    }

    sqlite_path = workdir / "work" / f"companies-{dataset_hash[:16]}.sqlite"
    print(f"Conectando ao banco SQLite compilado: {sqlite_path}")
    db = sqlite3.connect(sqlite_path)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA synchronous=NORMAL")
    db.execute("PRAGMA cache_size=-1000000") # 1GB memory cache

    writer = PartitionedCsvWriter(temp_dir)
    observed = {}

    def progress(msg):
        print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

    print("Iniciando exportacao particionada por estado (27 UFs)...")
    stats = export_national(
        db=db,
        archives=establishments,
        municipalities=municipios_dict,
        ibge=ibge,
        lookups=lookups,
        competence=competence,
        chunk_size=50000, # Fast chunk size
        observed=observed,
        writer=writer,
        progress=progress,
    )
    files = writer.close()
    mapping_file = write_mapping_file(temp_dir, observed, competence)
    db.close()

    print("Gerando manifest.json...")
    finished_time = time.time()
    rejections = {
        key: stats[key] for key in [
            "establishmentRowsRejected", "companyRowsRejected",
            "simplesRowsRejected", "unmatchedGeographyRows"
        ]
    }
    manifest = {
        "dataset": "CNPJ_COMPANIES",
        "source": SOURCE,
        "sourceVersion": competence,
        "sourceUrl": "https://arquivos.receitafederal.gov.br",
        "competencia": competence,
        "pipelineVersion": PIPELINE_VERSION,
        "datasetHash": dataset_hash,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(finished_time)),
        "durationSeconds": round(finished_time - started, 3),
        "filters": {"uf": None, "municipioIbge": None},
        "files": [asdict(f) for f in files],
        "municipalityMappingFile": asdict(mapping_file),
        "stats": dict(stats),
        "semantics": {
            "receitaFields": "OBSERVED",
            "icp": "NOT_AVAILABLE",
            "rntrcCompany": "NOT_AVAILABLE",
            "publicContact": "DADO_CADASTRAL_PUBLICO_NAO_VALIDADO"
        },
        "rejections": rejections,
    }
    (temp_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    
    snapshot_dir.parent.mkdir(parents=True, exist_ok=True)
    temp_dir.replace(snapshot_dir)
    print(f"Snapshot finalizado com sucesso em {snapshot_dir}!")
    print(f"Total registros: {stats['recordsExported']:,} (Ativas: {stats['activeRecordsExported']:,})")
    print(f"Tempo total: {round(finished_time - started, 1)}s")

if __name__ == "__main__":
    run()
