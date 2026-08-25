import sys
from pathlib import Path

# Add tool directory to sys.path
sys.path.insert(0, str(Path("public/tools/atlas-market-intelligence").resolve()))

from cnpj_company_pipeline import calculate_dataset_hash

zips_dir = Path(".cache/market-intelligence/cnpj_zips")
establishments = sorted(zips_dir.glob("Estabelecimentos*.zip"))
companies = sorted(zips_dir.glob("Empresas*.zip"))
simples = zips_dir / "Simples.zip"
municipios = zips_dir / "Municipios.zip"
cnaes = zips_dir / "Cnaes.zip"
naturezas = zips_dir / "Naturezas.zip"
qualificacoes = zips_dir / "Qualificacoes.zip"
motivos = zips_dir / "Motivos.zip"

archives = [*establishments, *companies, simples, municipios, cnaes, naturezas, qualificacoes, motivos]
competence = "2026-08"

dataset_hash = calculate_dataset_hash(competence, archives, None, None)
print(f"Calculated Hash: {dataset_hash}")
print(f"Prefix: {dataset_hash[:16]}")
print(f"Expected Prefix: d0413a13df4be958")
print(f"Match: {dataset_hash[:16] == 'd0413a13df4be958'}")
