import os
import csv
from src.core.logger import get_logger
from src.core.utils import save_json

logger = get_logger("etl_anac_aerodromos")

def get_real_data(file_path):
    if not os.path.exists(file_path):
        return None
    logger.info(f"Lendo base real de {file_path}...")
    data = []
    with open(file_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            data.append(row)
    return data

def mock_anac_aerodromos():
    logger.warning("Base real ausente. Usando mock_anac_aerodromos...")
    return [
        {"ibgeCode": "2910800", "municipio": "Feira de Santana", "uf": "BA", "tem_aeroporto": True, "distancia_aeroporto_km": 15},
        {"ibgeCode": "2927408", "municipio": "Salvador", "uf": "BA", "tem_aeroporto": True, "distancia_aeroporto_km": 20},
        {"ibgeCode": "3205309", "municipio": "Vitória", "uf": "ES", "tem_aeroporto": True, "distancia_aeroporto_km": 10}
    ]

def main():
    logger.info("Iniciando ingestão ANAC Aeródromos...")
    # Fonte bruta e mock de saida vivem em data/market-intelligence/ (nunca em public/), pois nem
    # o CSV bruto nem este mock sao buscados pelo navegador em nenhuma pagina do tool estatico —
    # ver data/market-intelligence/README.md.
    raw_path = "../../../data/market-intelligence/atlas-market-intelligence-pipeline/raw/anac_aerodromos.csv"
    data = get_real_data(raw_path)

    if not data:
        data = mock_anac_aerodromos()

    out_path = "../../../data/market-intelligence/atlas-market-intelligence-pipeline/anac_aerodromos_mock.json"
    save_json(data, out_path)
    logger.info("Ingestão ANAC finalizada.")

if __name__ == "__main__":
    main()
