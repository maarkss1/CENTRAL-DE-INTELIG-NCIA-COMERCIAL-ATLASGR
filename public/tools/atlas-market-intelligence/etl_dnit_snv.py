import os
import csv
from src.core.logger import get_logger
from src.core.utils import save_json

logger = get_logger("etl_dnit_snv")

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

def mock_dnit_snv():
    logger.warning("Base real ausente. Usando mock_dnit_snv...")
    return [
        {"ibgeCode": "2910800", "municipio": "Feira de Santana", "uf": "BA", "distancia_rodovia_federal_km": 0},
        {"ibgeCode": "2927408", "municipio": "Salvador", "uf": "BA", "distancia_rodovia_federal_km": 0},
        {"ibgeCode": "3205309", "municipio": "Vitória", "uf": "ES", "distancia_rodovia_federal_km": 0}
    ]

def main():
    logger.info("Iniciando ingestão DNIT SNV...")
    raw_path = "data/raw/dnit_snv.csv"
    data = get_real_data(raw_path)
    
    if not data:
        data = mock_dnit_snv()
        
    out_path = "data/dnit_snv_mock.json"
    save_json(data, out_path)
    logger.info("Ingestão DNIT finalizada.")

if __name__ == "__main__":
    main()
