import os
import sys
from dotenv import load_dotenv

# Carrega as chaves da API e configs a partir do .env
load_dotenv()

from src.core.logger import get_logger
logger = get_logger("run_pipeline")

def run_script(script_path):
    logger.info(f"Executando {script_path}...")
    ret = os.system(f"{sys.executable} {script_path}")
    if ret != 0:
        logger.error(f"Erro na execução de {script_path}")
        sys.exit(1)
    logger.info(f"{script_path} finalizado com sucesso.")

def main():
    logger.info("=== INICIANDO PIPELINE ATLAS GR ===")
    
    scripts = [
        "etl_ibge_regic.py",
        "etl_anac_aerodromos.py",
        "etl_dnit_snv.py",
        "scripts/market_intelligence/maps_search_runner.py",
        "scripts/market_intelligence/econodata_search_runner.py",
        # Incluir outros ETLs conforme a ordem de prioridade...
    ]
    
    for s in scripts:
        if os.path.exists(s):
            run_script(s)
        else:
            logger.warning(f"Script ignorado (não encontrado): {s}")

    logger.info("=== PIPELINE FINALIZADO COM SUCESSO ===")

if __name__ == "__main__":
    main()
