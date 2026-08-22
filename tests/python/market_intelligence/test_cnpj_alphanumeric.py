import csv
import io
import sqlite3
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

MODULE_DIR = Path(__file__).resolve().parents[3] / "public" / "tools" / "atlas-market-intelligence"
sys.path.insert(0, str(MODULE_DIR))

import cnpj_company_pipeline as company_pipeline  # noqa: E402
import etl_cnpj_atlas as etl  # noqa: E402


class CnpjAlphanumericCompatibilityTest(unittest.TestCase):
    def test_company_pipeline_preserves_letters_in_cnpj_segments(self):
        self.assertEqual(company_pipeline.normalize_code("AB12.cd34"), "AB12CD34")
        self.assertEqual(company_pipeline.normalize_code("E08G"), "E08G")
        self.assertEqual(company_pipeline.normalize_code("12"), "12")

    def test_icp_etl_accepts_alphanumeric_order_without_numeric_coercion(self):
        taxonomy = {
            "precedence": ["A", "B", "C"],
            "tiers": {
                "A": {"cnaePrefixes": ["4930"]},
                "B": {"cnaePrefixes": []},
                "C": {"cnaePrefixes": []},
            },
        }
        row = [""] * 22
        row[0] = "00000000"
        row[1] = "E08G"
        row[2] = "12"
        row[3] = "2"
        row[5] = "02"
        row[11] = "4930202"
        row[12] = ""
        row[19] = "DF"
        row[20] = "9701"

        with tempfile.TemporaryDirectory() as tmp:
            archive = Path(tmp) / "Estabelecimentos0.zip"
            buffer = io.StringIO()
            csv.writer(buffer, delimiter=";", quotechar='"', lineterminator="\n").writerow(row)
            with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zipped:
                zipped.writestr("ESTABELE", buffer.getvalue().encode("latin-1"))

            db = sqlite3.connect(":memory:")
            db.executescript("""
              CREATE TABLE candidate_establishment (
                cnpj_basic TEXT NOT NULL, cnpj_full TEXT PRIMARY KEY, matrix_branch TEXT,
                uf TEXT NOT NULL, receita_municipality_code TEXT NOT NULL, primary_cnae TEXT,
                matched_cnae TEXT, tier TEXT NOT NULL
              );
            """)
            stats = etl.process_establishments(db, [archive], taxonomy)
            saved = db.execute("SELECT cnpj_basic, cnpj_full FROM candidate_establishment").fetchone()
            db.close()

        self.assertEqual(stats["candidate_establishments"], 1)
        self.assertEqual(saved, ("00000000", "00000000E08G12"))

    def test_icp_etl_accepts_letters_in_basic_segment(self):
        taxonomy = {"precedence": ["A"], "tiers": {"A": {"cnaePrefixes": ["4930"]}}}
        row = [""] * 22
        row[0] = "AB12CD34"
        row[1] = "0001"
        row[2] = "90"
        row[3] = "1"
        row[5] = "02"
        row[11] = "4930202"
        row[19] = "SP"
        row[20] = "7107"

        with tempfile.TemporaryDirectory() as tmp:
            archive = Path(tmp) / "Estabelecimentos0.zip"
            buffer = io.StringIO()
            csv.writer(buffer, delimiter=";", quotechar='"', lineterminator="\n").writerow(row)
            with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zipped:
                zipped.writestr("ESTABELE", buffer.getvalue().encode("latin-1"))

            db = sqlite3.connect(":memory:")
            db.executescript("""
              CREATE TABLE candidate_establishment (
                cnpj_basic TEXT NOT NULL, cnpj_full TEXT PRIMARY KEY, matrix_branch TEXT,
                uf TEXT NOT NULL, receita_municipality_code TEXT NOT NULL, primary_cnae TEXT,
                matched_cnae TEXT, tier TEXT NOT NULL
              );
            """)
            etl.process_establishments(db, [archive], taxonomy)
            saved = db.execute("SELECT cnpj_basic, cnpj_full FROM candidate_establishment").fetchone()
            db.close()

        self.assertEqual(saved, ("AB12CD34", "AB12CD34000190"))


if __name__ == "__main__":
    unittest.main()
