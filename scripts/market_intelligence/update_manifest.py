import gzip
import csv
import json
import hashlib
from pathlib import Path

def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def count_records(path: Path) -> int:
    count = 0
    with gzip.open(path, "rt", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        next(reader, None) # skip header
        for _ in reader:
            count += 1
    return count

def update_manifest():
    snapshot_dir = Path(".cache/market-intelligence/normalized/companies/competencia=2026-08/snapshot=d0413a13df4be958")
    manifest_path = snapshot_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    print("Recalculando hashes e contagens de todos os arquivos normalizados...")
    total_records = 0
    for item in manifest["files"]:
        file_path = snapshot_dir / item["path"]
        print(f"Processando {item['path']}...")
        sha = sha256_file(file_path)
        records = count_records(file_path)
        item["sha256"] = sha
        item["records"] = records
        total_records += records
        print(f"  -> {records:,} registros, sha256={sha[:16]}...")

    mapping_file = snapshot_dir / manifest["municipalityMappingFile"]["path"]
    if mapping_file.exists():
        print(f"Processando {mapping_file.name}...")
        manifest["municipalityMappingFile"]["sha256"] = sha256_file(mapping_file)
        manifest["municipalityMappingFile"]["records"] = count_records(mapping_file)

    manifest["stats"]["recordsExported"] = total_records
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nManifest atualizado com sucesso! Total exportado: {total_records:,}")

if __name__ == "__main__":
    update_manifest()
