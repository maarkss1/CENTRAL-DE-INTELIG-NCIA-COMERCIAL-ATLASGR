import os
import json
import csv
from src.core.logger import get_logger
from src.core.utils import save_json

logger = get_logger("etl_ibge_regic")

def get_real_data(file_path):
    """Tenta ler um arquivo CSV real."""
    if not os.path.exists(file_path):
        return None
    
    logger.info(f"Lendo base real de {file_path}...")
    data = []
    with open(file_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            data.append(row)
    return data

def mock_ibge_regic():
    logger.warning("Base real ausente. Usando mock_ibge_regic...")
    return [
        {"ibgeCode": "2910800", "municipio": "Feira de Santana", "uf": "BA", "hierarquia": 2, "distancia_polo_km": 0},
        {"ibgeCode": "2927408", "municipio": "Salvador", "uf": "BA", "hierarquia": 1, "distancia_polo_km": 0},
        {"ibgeCode": "3205309", "municipio": "Vitória", "uf": "ES", "hierarquia": 2, "distancia_polo_km": 0}
    ]

def main():
    logger.info("Iniciando ingestão REGIC...")
    
    # Fonte bruta e mock de saida vivem em data/market-intelligence/ (nunca em public/), pois nem
    # o CSV bruto nem este mock sao buscados pelo navegador em nenhuma pagina do tool estatico —
    # ver data/market-intelligence/README.md.
    raw_path = "../../../data/market-intelligence/atlas-market-intelligence-pipeline/raw/ibge_regic.csv"
    data = get_real_data(raw_path)

    if not data:
        data = mock_ibge_regic()

    out_path = "../../../data/market-intelligence/atlas-market-intelligence-pipeline/ibge_regic_mock.json"
    save_json(data, out_path)
    logger.info("Ingestão REGIC finalizada.")

if __name__ == "__main__":
    main()
