import gzip
import json
import hashlib
from pathlib import Path
import time

def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def count_lines_gz(path: Path) -> int:
    count = 0
    with gzip.open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            count += chunk.count(b"\n")
    return max(0, count - 1) # subtract header

def main():
    started = time.time()
    snapshot_dir = Path(".cache/market-intelligence/normalized/companies/competencia=2026-08/snapshot=d0413a13df4be958")
    manifest_path = snapshot_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    print("Atualizando hashes e contagens (leitura binaria rapida)...", flush=True)
    total_records = 0
    for item in manifest["files"]:
        file_path = snapshot_dir / item["path"]
        sha = sha256_file(file_path)
        records = count_lines_gz(file_path)
        item["sha256"] = sha
        item["records"] = records
        total_records += records
        print(f"[{item['uf']}] {records:,} registros | sha256: {sha[:16]}...", flush=True)

    mapping_file = snapshot_dir / manifest["municipalityMappingFile"]["path"]
    if mapping_file.exists():
        manifest["municipalityMappingFile"]["sha256"] = sha256_file(mapping_file)
        manifest["municipalityMappingFile"]["records"] = count_lines_gz(mapping_file)
        print(f"[MAPPING] {manifest['municipalityMappingFile']['records']} registros", flush=True)

    manifest["stats"]["recordsExported"] = total_records
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nManifest 100% calibrado em {time.time()-started:.1f}s! Total: {total_records:,} empresas", flush=True)

if __name__ == "__main__":
    main()
