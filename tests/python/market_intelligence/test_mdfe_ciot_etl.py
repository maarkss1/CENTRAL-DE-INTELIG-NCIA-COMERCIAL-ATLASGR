from __future__ import annotations

import csv
import sys
import tempfile
import unittest
from pathlib import Path

MODULE_DIR = Path(__file__).resolve().parents[3] / "public" / "tools" / "atlas-market-intelligence"
sys.path.insert(0, str(MODULE_DIR))

from etl_mdfe_atlas import aggregate, map_columns, parse_number  # noqa: E402

IBGE_FIXTURE = {
    ("SP", "SAO PAULO"): {"ibgeCode": "3550308", "name": "São Paulo", "uf": "SP"},
    ("GO", "GOIANIA"): {"ibgeCode": "5208707", "name": "Goiânia", "uf": "GO"},
}


class ColumnMappingTests(unittest.TestCase):
    def test_recognizes_ciot_columns(self) -> None:
        fieldnames = ["municipio_origem", "uf_origem", "municipio_destino", "uf_destino", "ncm_carga", "quantidade_ciots", "quantidade_trc"]
        mapped = map_columns(fieldnames)
        self.assertEqual(mapped["municipio_origem"], "municipio_origem")
        self.assertEqual(mapped["ncm_grupo"], "ncm_carga")
        self.assertEqual(mapped["viagens"], "quantidade_ciots")
        self.assertNotIn("mdfe", mapped)  # CIOT nao mede manifestos; nunca deve casar em "mdfe"

    def test_recognizes_generic_mdfe_export_columns(self) -> None:
        fieldnames = ["Município de Origem", "UF de Origem", "Município de Destino", "UF de Destino", "Quantidade de MDF-e", "Toneladas"]
        mapped = map_columns(fieldnames)
        self.assertEqual(mapped["mdfe"], "Quantidade de MDF-e")
        self.assertEqual(mapped["toneladas"], "Toneladas")


class ParseNumberTests(unittest.TestCase):
    def test_parses_brazilian_thousand_and_decimal_separators(self) -> None:
        self.assertEqual(parse_number("1.234,5"), 1234.5)

    def test_blank_and_none_are_none(self) -> None:
        self.assertIsNone(parse_number(""))
        self.assertIsNone(parse_number(None))


class AggregateCiotFixtureTests(unittest.TestCase):
    def test_aggregates_origin_destination_flow_and_flags_interstate(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "ciot.csv"
            with path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.writer(handle, delimiter=";")
                writer.writerow(["municipio_origem", "uf_origem", "municipio_destino", "uf_destino", "ncm_carga", "quantidade_ciots"])
                writer.writerow(["Sao Paulo", "SP", "Goiania", "GO", "10.01", "5"])
                writer.writerow(["Sao Paulo", "SP", "Sao Paulo", "SP", "10.01", "3"])
                writer.writerow(["", "", "", "", "99.99", "1000"])  # agregado nacional sem geografia
                writer.writerow(["Municipio Inexistente", "XX", "Goiania", "GO", "10.01", "2"])  # geografia nao casa

            result = aggregate(path, IBGE_FIXTURE)

            self.assertEqual(result["stats"]["rowsRead"], 4)
            self.assertEqual(result["stats"]["matchedRows"], 2)
            self.assertEqual(result["stats"]["unmatchedGeographyRows"], 2)
            self.assertEqual(result["stats"]["interstateRows"], 1)

            interstate_flow = next(f for f in result["flowRows"] if f["interstate"])
            self.assertEqual(interstate_flow["originIbgeCode"], "3550308")
            self.assertEqual(interstate_flow["destinationIbgeCode"], "5208707")
            self.assertEqual(interstate_flow["trips"], 5)
            self.assertIsNone(interstate_flow["manifests"])  # CIOT nunca preenche manifests

            sp_origin = next(r for r in result["originRows"] if r["ibgeCode"] == "3550308")
            self.assertEqual(sp_origin["trips"], 8)  # soma das duas linhas com origem em SP


if __name__ == "__main__":
    unittest.main()
