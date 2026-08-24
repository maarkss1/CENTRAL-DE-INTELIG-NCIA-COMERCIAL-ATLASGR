import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path("scripts/market_intelligence").resolve()))
from import_companies import Psql, import_dataset, publish

def run():
    database_url = "postgresql://prospector_app:prospector_app_pass@localhost:5434/prospectordb"
    psql_bin = r"C:\Program Files\PostgreSQL\16\bin\psql.exe"
    manifest_path = Path(".cache/market-intelligence/normalized/companies/competencia=2026-08/snapshot=d0413a13df4be958/manifest.json").resolve()
    
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    psql = Psql(psql_bin, database_url)
    
    print("Iniciando importacao em massa no PostgreSQL...", flush=True)
    dataset_id = import_dataset(manifest, manifest_path, psql)
    print(f"Dataset importado: {dataset_id}", flush=True)
    
    print("Publicando dataset no slot CNPJ_ACTIVE...", flush=True)
    publish(dataset_id, "CNPJ_ACTIVE", psql)
    print("Dataset publicado com sucesso!", flush=True)

if __name__ == "__main__":
    run()
