from __future__ import annotations

import sys
import unittest
from pathlib import Path

MODULE_DIR = Path(__file__).resolve().parents[3] / "public" / "tools" / "atlas-market-intelligence"
sys.path.insert(0, str(MODULE_DIR))

from etl_senatran_frota import (  # noqa: E402
    RESOURCE_NAME_RE,
    aggregate,
    find_header_row,
    parse_month_year,
    parse_quantity,
)

HEADER = [
    "UF", "MUNICIPIO", "TOTAL", "AUTOMOVEL", "CAMINHAO", "CAMINHAO TRATOR",
    "REBOQUE", "SEMI-REBOQUE", "MOTOCICLETA",
]

IBGE_FIXTURE = {
    ("SP", "SAO PAULO"): {"ibgeCode": "3550308", "name": "São Paulo", "uf": "SP", "region": "Sudeste"},
    ("GO", "GOIANIA"): {"ibgeCode": "5208707", "name": "Goiânia", "uf": "GO", "region": "Centro-Oeste"},
}


class MonthYearParsingTests(unittest.TestCase):
    def test_parses_full_month_name_with_accented_or_bare_ascii(self) -> None:
        self.assertEqual(parse_month_year("Frota_por_municipio_e_tipo_Julho_2026.xlsx"), (2026, 7))
        self.assertEqual(parse_month_year("frotapormunicipioetipofevereiro2026.xlsx"), (2026, 2))
        self.assertEqual(parse_month_year("frota-por-municipio-e-tipo-janeiro-2026.xlsx"), (2026, 1))

    def test_returns_none_when_no_month_present(self) -> None:
        self.assertIsNone(parse_month_year("A_Frota_por_UF_Municipio_CEP_2026.xlsx"))


class ResourceNameRegexTests(unittest.TestCase):
    def test_matches_known_url_variants(self) -> None:
        self.assertTrue(RESOURCE_NAME_RE.search("Frota_por_municipio_e_tipo_Julho_2026.xlsx"))
        self.assertTrue(RESOURCE_NAME_RE.search("frotapormunicipioetipofevereiro2026.xlsx"))

    def test_does_not_match_unrelated_resource(self) -> None:
        self.assertFalse(RESOURCE_NAME_RE.search("A_Frota_por_UF_Municipio_CEP_Julho_2026.xlsx"))
        self.assertFalse(RESOURCE_NAME_RE.search("Frota_por_uf_e_tipo_de_veiculo_Julho_2026.xlsx"))


class QuantityParsingTests(unittest.TestCase):
    def test_parses_numeric_strings_and_defaults_invalid_to_zero(self) -> None:
        self.assertEqual(parse_quantity("42"), 42)
        self.assertEqual(parse_quantity(None), 0)
        self.assertEqual(parse_quantity("abc"), 0)


class HeaderAndAggregateTests(unittest.TestCase):
    def test_finds_header_row_skipping_title_and_duplicate(self) -> None:
        rows = [
            ["Frota de veiculos, por tipo..."],
            ["132323836"],
            HEADER,
            HEADER,
            ["SP", "SAO PAULO", "100", "50", "10", "5", "3", "2", "30"],
        ]
        idx, columns = find_header_row(rows)
        self.assertEqual(idx, 2)
        self.assertEqual(columns["MUNICIPIO"], 1)
        self.assertEqual(columns["CAMINHAO"], 4)

    def test_aggregate_sums_cargo_types_and_reports_unmatched_geography(self) -> None:
        rows = [
            ["title"],
            ["total"],
            HEADER,
            HEADER,
            ["SP", "SAO PAULO", "100", "50", "10", "5", "3", "2", "30"],
            ["GO", "GOIANIA", "40", "20", "4", "1", "1", "1", "13"],
            ["SP", "MUNICIPIO INEXISTENTE", "5", "5", "0", "0", "0", "0", "0"],
            [None],  # linha em branco no meio da planilha
        ]
        output, stats = aggregate(rows, IBGE_FIXTURE)
        self.assertEqual(stats["rows_processed"], 3)
        self.assertEqual(stats["municipalities_matched"], 2)
        self.assertEqual(stats["rows_unmatched_geography"], 1)

        by_code = {row["ibgeCode"]: row for row in output}
        sp = by_code["3550308"]
        self.assertEqual(sp["total"], 100)
        self.assertEqual(sp["cargoFleet"], 10 + 5 + 3 + 2)  # CAMINHAO + CAMINHAO TRATOR + REBOQUE + SEMI-REBOQUE
        self.assertEqual(sp["byType"]["CAMINHAO"], 10)
        self.assertNotIn("UF", sp)


if __name__ == "__main__":
    unittest.main()
