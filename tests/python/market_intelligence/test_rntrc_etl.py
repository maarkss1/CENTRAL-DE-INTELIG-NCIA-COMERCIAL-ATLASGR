from __future__ import annotations

import csv
import sys
import tempfile
import unittest
from pathlib import Path

MODULE_DIR = Path(__file__).resolve().parents[3] / "public" / "tools" / "atlas-market-intelligence"
sys.path.insert(0, str(MODULE_DIR))

from etl_rntrc_atlas import extract_uf  # noqa: E402
from etl_rntrc_veiculos_atlas import (  # noqa: E402
    aggregate,
    classify_transporter,
    classify_vehicle_type,
)


class IbgeGeographyTests(unittest.TestCase):
    def test_extract_uf_tolerates_null_microrregiao(self) -> None:
        row = {
            "microrregiao": None,
            "regiao-imediata": {
                "regiao-intermediaria": {
                    "UF": {"sigla": "SP", "regiao": {"nome": "Sudeste"}}
                }
            },
        }
        self.assertEqual(extract_uf(row)["sigla"], "SP")

    def test_extract_uf_accepts_legacy_microregion_shape(self) -> None:
        row = {
            "microrregiao": {
                "mesorregiao": {
                    "UF": {"sigla": "GO", "regiao": {"nome": "Centro-Oeste"}}
                }
            }
        }
        self.assertEqual(extract_uf(row)["sigla"], "GO")


class FleetClassificationTests(unittest.TestCase):
    def test_official_vehicle_type_classification(self) -> None:
        self.assertEqual(classify_vehicle_type("Tração"), "traction")
        self.assertEqual(classify_vehicle_type("Implemento"), "implement")
        self.assertEqual(classify_vehicle_type("Não informado"), "other")

    def test_transporter_category_classification(self) -> None:
        self.assertEqual(classify_transporter("ETC"), "etc")
        self.assertEqual(classify_transporter("ETC - EQUIPARADO"), "etc_equiparada")
        self.assertEqual(classify_transporter("TAC"), "tac")
        self.assertEqual(classify_transporter("CTC"), "ctc")


class FleetOfficialSchemaFixtureTests(unittest.TestCase):
    def test_small_fixture_aggregates_quantities_by_uf_without_inventing_municipality(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            vehicles = Path(tmp) / "rntrc-veiculos.csv"
            with vehicles.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.writer(handle, delimiter=";")
                writer.writerow([
                    "Categoria do Transportador",
                    "Tipo de Veículo",
                    "UF do Veículo",
                    "Categoria",
                    "Carroceria",
                    "Ano de Fabricação do Veículo",
                    "Quantidade",
                ])
                writer.writerow(["ETC", "Tração", "SP", "Caminhão Trator", "Não se aplica", "2022", "10"])
                writer.writerow(["ETC - EQUIPARADO", "Implemento", "SP", "Semirreboque", "Baú", "2020", "15"])
                writer.writerow(["TAC", "Tração", "GO", "Caminhão", "Aberta", "2018", "7"])
                writer.writerow(["CTC", "Implemento", "GO", "Reboque", "Tanque", "2019", "3"])
                writer.writerow(["ETC", "Tração", "XX", "Caminhão", "Baú", "2021", "99"])
                writer.writerow(["ETC", "Tração", "SP", "Caminhão", "Baú", "2021", "abc"])

            rows, stats, diagnostics = aggregate(vehicles)
            by_uf = {row["uf"]: row for row in rows}

            self.assertEqual(set(by_uf), {"GO", "SP"})
            self.assertEqual(stats["rows_processed"], 6)
            self.assertEqual(stats["rows_valid"], 4)
            self.assertEqual(stats["rows_invalid_uf"], 1)
            self.assertEqual(stats["rows_invalid_quantity"], 1)
            self.assertEqual(stats["quantity_total"], 35)

            sp = by_uf["SP"]
            self.assertEqual(sp["fleetTotal"], 25)
            self.assertEqual(sp["tractionVehicles"], 10)
            self.assertEqual(sp["implements"], 15)
            self.assertEqual(sp["municipalUse"], "PROXY_UF")
            self.assertEqual(sp["geographyLevel"], "UF")
            self.assertEqual(sp["fleetByTransporterCategory"]["ETC"], 10)
            self.assertEqual(sp["fleetByTransporterCategory"]["ETC_EQUIPARADA"], 15)

            go = by_uf["GO"]
            self.assertEqual(go["fleetTotal"], 10)
            self.assertEqual(go["tractionVehicles"], 7)
            self.assertEqual(go["implements"], 3)
            self.assertEqual(go["fleetByTransporterCategory"]["TAC"], 7)
            self.assertEqual(go["fleetByTransporterCategory"]["CTC"], 3)

            self.assertEqual(diagnostics["observedVehicleCategories"]["CAMINHAO TRATOR"], 10)


if __name__ == "__main__":
    unittest.main()
