from __future__ import annotations

import io
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

MODULE_DIR = Path(__file__).resolve().parents[3] / "public" / "tools" / "atlas-market-intelligence"
sys.path.insert(0, str(MODULE_DIR))

from etl_sinesp_risco import (  # noqa: E402
    aggregate,
    excel_serial_to_month,
    norm,
    parse_int,
    stream_rows,
)

SHEET_XML_TEMPLATE = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>
{rows}
</sheetData>
</worksheet>"""


def inline_cell(ref: str, text: str) -> str:
    return f'<c r="{ref}" t="inlineStr"><is><t>{text}</t></is></c>'


def numeric_cell(ref: str, value: str) -> str:
    return f'<c r="{ref}" t="n"><v>{value}</v></c>'


def make_xlsx(rows_xml: list[str]) -> Path:
    sheet = SHEET_XML_TEMPLATE.format(rows="\n".join(rows_xml))
    handle = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
    with zipfile.ZipFile(handle.name, "w") as archive:
        archive.writestr("xl/worksheets/sheet1.xml", sheet)
    return Path(handle.name)


def row_xml(row_num: int, cells: dict[str, str], numeric_cols: set[str] = frozenset()) -> str:
    parts = []
    for col, value in cells.items():
        ref = f"{col}{row_num}"
        parts.append(numeric_cell(ref, value) if col in numeric_cols else inline_cell(ref, value))
    return f'<row r="{row_num}">{"".join(parts)}</row>'


HEADER = {"A": "uf", "B": "municipio", "C": "evento", "D": "data_referencia", "L": "total", "N": "abrangencia"}


class StreamRowsTests(unittest.TestCase):
    def test_reads_header_and_data_rows_from_synthetic_xlsx(self) -> None:
        path = make_xlsx([
            row_xml(1, HEADER),
            row_xml(2, {"A": "SP", "B": "NÃO INFORMADO", "C": "Roubo de carga", "D": "46023", "L": "12", "N": "Estadual"}, numeric_cols={"D", "L"}),
        ])
        try:
            rows = list(stream_rows(path))
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["uf"], "SP")
            self.assertEqual(rows[0]["evento"], "Roubo de carga")
            self.assertEqual(rows[0]["total"], "12")
        finally:
            path.unlink()


class ExcelSerialToMonthTests(unittest.TestCase):
    def test_converts_known_serial_to_month(self) -> None:
        # 46023 == 2026-01-01 (epoca Excel 1899-12-30)
        self.assertEqual(excel_serial_to_month("46023"), "2026-01")

    def test_none_and_blank_return_none(self) -> None:
        self.assertIsNone(excel_serial_to_month(None))
        self.assertIsNone(excel_serial_to_month(""))


class ParseIntTests(unittest.TestCase):
    def test_parses_and_defaults_blank_to_zero(self) -> None:
        self.assertEqual(parse_int("42"), 42)
        self.assertEqual(parse_int(None), 0)
        self.assertEqual(parse_int(""), 0)


class AggregateUfLevelTests(unittest.TestCase):
    def test_aggregates_by_uf_and_ignores_unrelated_events(self) -> None:
        rows = [
            row_xml(1, HEADER),
            row_xml(2, {"A": "SP", "B": "NÃO INFORMADO", "C": "Roubo de carga", "D": "46023", "L": "10", "N": "Estadual"}, numeric_cols={"D", "L"}),
            row_xml(3, {"A": "SP", "B": "NÃO INFORMADO", "C": "Roubo de carga", "D": "46023", "L": "5", "N": "Policia Federal"}, numeric_cols={"D", "L"}),
            row_xml(4, {"A": "SP", "B": "São Paulo", "C": "Furto de veículo", "D": "46054", "L": "20", "N": "Estadual"}, numeric_cols={"D", "L"}),
            row_xml(5, {"A": "SP", "B": "NÃO INFORMADO", "C": "Feminicídio", "D": "46023", "L": "1", "N": "Estadual"}, numeric_cols={"D", "L"}),  # evento fora do escopo
        ]
        path = make_xlsx(rows)
        try:
            result, stats = aggregate(path, {"SP": "Sudeste"})
            self.assertEqual(len(result), 1)
            sp = result[0]
            self.assertEqual(sp["cargoRobbery"], 15)  # 10 (Estadual) + 5 (Policia Federal) somados
            self.assertEqual(sp["vehicleTheft"], 20)
            self.assertEqual(sp["vehicleRobbery"], 0)
            self.assertEqual(sp["geography"], "PROXY_UF")
            self.assertEqual(stats["relevant_event_rows"], 3)  # feminicidio nao conta
            self.assertEqual(stats["relevant_rows_with_municipal_detail"], 1)  # so a linha de Furto de veiculo tem municipio real
        finally:
            path.unlink()

    def test_uf_not_in_ibge_registry_is_counted_as_unmatched(self) -> None:
        rows = [
            row_xml(1, HEADER),
            row_xml(2, {"A": "ZZ", "B": "NÃO INFORMADO", "C": "Roubo de carga", "D": "46023", "L": "3", "N": "Estadual"}, numeric_cols={"D", "L"}),
        ]
        path = make_xlsx(rows)
        try:
            result, stats = aggregate(path, {"SP": "Sudeste"})
            self.assertEqual(result, [])
            self.assertEqual(stats["rows_unmatched_uf"], 1)
        finally:
            path.unlink()


class NormTests(unittest.TestCase):
    def test_strips_accents_and_uppercases(self) -> None:
        self.assertEqual(norm("Roubo de veículo"), "ROUBO DE VEICULO")
        self.assertEqual(norm("NÃO INFORMADO"), "NAO INFORMADO")


if __name__ == "__main__":
    unittest.main()
