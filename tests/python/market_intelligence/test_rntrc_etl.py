from __future__ import annotations

import csv
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

MODULE_DIR = Path(__file__).resolve().parents[3] / "public" / "tools" / "atlas-market-intelligence"
sys.path.insert(0, str(MODULE_DIR))

from etl_rntrc_atlas import extract_uf  # noqa: E402
from etl_rntrc_veiculos_atlas import (  # noqa: E402
    aggregate_vehicles,
    build_transport_geography,
    classify_vehicle,
)


class IbgeGeographyTests(unittest.TestCase):
    def test_extract_uf_tolerates_null_microrregiao(self) -> None:
        row = {
            "microrregiao": None,
            "regiao-imediata": {
                "regiao-intermediaria": {
                    "UF": {
                        "sigla": "SP",
                        "regiao": {"nome": "Sudeste"},
                    }
                }
            },
        }
        self.assertEqual(extract_uf(row)["sigla"], "SP")

    def test_extract_uf_accepts_legacy_microregion_shape(self) -> None:
        row = {
            "microrregiao": {
                "mesorregiao": {
                    "UF": {
                        "sigla": "GO",
                        "regiao": {"nome": "Centro-Oeste"},
                    }
                }
            }
        }
        self.assertEqual(extract_uf(row)["sigla"], "GO")


class FleetClassificationTests(unittest.TestCase):
    def test_vehicle_classification(self) -> None:
        self.assertEqual(classify_vehicle("Caminhão Trator", ""), "traction")
        self.assertEqual(classify_vehicle("Semi-Reboque", "Baú"), "implement")
        self.assertEqual(classify_vehicle("Tipo não mapeado", ""), "other")


class FleetJoinFixtureTests(unittest.TestCase):
    def test_small_fixture_joins_rntrc_to_ibge_and_aggregates(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            transporters = root / "transportadores.csv"
            vehicles = root / "veiculos.csv"

            with transporters.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.writer(handle, delimiter=";")
                writer.writerow(["RNTRC", "Município", "UF", "Situação RNTRC"])
                writer.writerow(["12345678", "Ribeirão Preto", "SP", "ATIVO"])
                writer.writerow(["87654321", "Goiânia", "GO", "ATIVO"])
                writer.writerow(["99999999", "Ribeirão Preto", "SP", "INATIVO"])

            with vehicles.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.writer(handle, delimiter=";")
                writer.writerow(["RNTRC", "Tipo Veículo", "Carroceria"])
                writer.writerow(["12345678", "Caminhão Trator", ""])
                writer.writerow(["12345678", "Semi-Reboque", "Baú"])
                writer.writerow(["87654321", "Caminhonete", ""])
                writer.writerow(["99999999", "Caminhão", ""])

            ibge = {
                ("SP", "RIBEIRAO PRETO"): {
                    "ibge_code": "3543402",
                    "municipality": "Ribeirão Preto",
                    "uf": "SP",
                    "region": "Sudeste",
                },
                ("GO", "GOIANIA"): {
                    "ibge_code": "5208707",
                    "municipality": "Goiânia",
                    "uf": "GO",
                    "region": "Centro-Oeste",
                },
            }

            db = sqlite3.connect(":memory:")
            try:
                transport_stats = build_transport_geography(transporters, ibge, db)
                totals, vehicle_stats, _ = aggregate_vehicles(vehicles, db)
            finally:
                db.close()

            self.assertEqual(transport_stats["transporters_active"], 2)
            self.assertEqual(transport_stats["transporters_with_geo"], 2)
            self.assertEqual(vehicle_stats["vehicles_processed"], 4)
            self.assertEqual(vehicle_stats["vehicles_matched_transporters"], 3)
            self.assertEqual(vehicle_stats["vehicles_unmatched_rntrc"], 1)

            rp = totals["3543402"]
            self.assertEqual(rp.total, 2)
            self.assertEqual(rp.traction, 1)
            self.assertEqual(rp.implements, 1)
            self.assertEqual(rp.other, 0)

            goiania = totals["5208707"]
            self.assertEqual(goiania.total, 1)
            self.assertEqual(goiania.traction, 1)


if __name__ == "__main__":
    unittest.main()
