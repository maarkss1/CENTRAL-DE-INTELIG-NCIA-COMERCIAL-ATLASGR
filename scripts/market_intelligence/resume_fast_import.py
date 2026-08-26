import os
import sys
import json
import time
from pathlib import Path

sys.path.insert(0, str(Path("scripts/market_intelligence").resolve()))
from import_companies import Psql, import_company_file, publish, mark_failed, sql_literal

def run():
    started = time.perf_counter()
    database_url = "postgresql://prospector_app:prospector_app_pass@localhost:5434/prospectordb"
    psql_bin = r"C:\Program Files\PostgreSQL\16\bin\psql.exe"
    manifest_path = Path(".cache/market-intelligence/normalized/companies/competencia=2026-08/snapshot=d0413a13df4be958/manifest.json").resolve()
    
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    psql = Psql(psql_bin, database_url)
    
    print("=" * 60, flush=True)
    print("RETOMANDO CARGA NO POSTGRESQL (A partir de RJ - UF 19)", flush=True)
    print("=" * 60, flush=True)
    
    dataset_id = "ed7771d7-e4b7-43d4-ab27-5b3328835f60"
    
    try:
        imported = 34399571
        total_files = len(manifest["files"])
        print(f"\n2. Executando streaming COPY para os estados restantes...", flush=True)
        
        for index, item in enumerate(manifest["files"], start=1):
            if index < 19:
                continue
                
            uf_name = item.get("uf", item["path"].split("\\")[0].replace("uf=", ""))
            source = manifest_path.parent / item["path"]
            file_start = time.perf_counter()
            
            print(f"   [{index:02d}/{total_files}] Carregando {uf_name} ({item['records']:,} empresas)...", end="", flush=True)
            import_company_file(psql, dataset_id, source)
            
            imported += int(item["records"])
            psql.run(f"""
SET app.bypass_rls='on';
UPDATE "MarketIntelligenceDataset" SET "recordsImported"={imported},"updatedAt"=CURRENT_TIMESTAMP
WHERE "id"={sql_literal(dataset_id)};
""")
            file_elapsed = time.perf_counter() - file_start
            print(f" OK! ({file_elapsed:.1f}s | acumulado: {imported:,} empresas)", flush=True)

        print("\n3. Publicando dataset no slot CNPJ_ACTIVE...", flush=True)
        publish(psql, dataset_id, imported, int(manifest["stats"].get("activeRecordsExported", 0)))
        print("   -> Publicacao concluida com sucesso!", flush=True)
        
        total_elapsed = time.perf_counter() - started
        print(f"\nCARGA CONCLUIDA COM SUCESSO EM {total_elapsed/60:.1f} MINUTOS!", flush=True)
        print(f"Total final esperado no Postgres: {imported:,} empresas", flush=True)
        return dataset_id

    except Exception as error:
        print(f"\nERRO NA IMPORTACAO: {error}", file=sys.stderr, flush=True)
        mark_failed(psql, dataset_id, str(error))
        raise

if __name__ == "__main__":
    run()
