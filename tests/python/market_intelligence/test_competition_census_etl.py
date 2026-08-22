import csv
import sys
import tempfile
import unittest
from pathlib import Path

MODULE_DIR = Path(__file__).resolve().parents[3] / "public" / "tools" / "atlas-market-intelligence"
sys.path.insert(0, str(MODULE_DIR))

import etl_concorrencia_censo as census  # noqa: E402


class CompetitionCensusEtlTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        self.municipios = [
            {"ibgeCode": "3543402", "name": "Ribeirão Preto", "uf": "SP"},
            {"ibgeCode": "3550308", "name": "São Paulo", "uf": "SP"},
        ]

    def tearDown(self):
        self.tmp.cleanup()

    def write_csv(self, name, fieldnames, rows):
        path = self.base / name
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
        return path

    def coverage_fields(self):
        return [
            "ibge_code", "municipio", "uf", "protocol_version",
            *census.REQUIRED_CHECKS, "reviewed_by", "verified_at", "confidence", "census_status",
        ]

    def test_complete_requires_every_protocol_check(self):
        by_code, by_name = census.geography_indexes(self.municipios)
        row = {
            "ibge_code": "3543402",
            "municipio": "Ribeirão Preto",
            "uf": "SP",
            "protocol_version": census.PROTOCOL_VERSION,
            "local_business_search": "sim",
            "national_provider_search": "sim",
            "primary_websites_reviewed": "sim",
            "business_registry_search": "sim",
            "maps_search": "sim",
            "negative_evidence_recorded": "nao",
            "reviewed_by": "analista-01",
            "verified_at": "2026-08-22T10:00:00-03:00",
            "confidence": "ALTO",
            "census_status": "CENSO_COMPLETO",
        }
        coverage = self.write_csv("coverage.csv", self.coverage_fields(), [row])
        metrics = {}

        _, requested, accepted = census.apply_coverage(metrics, coverage, by_code, by_name)

        self.assertEqual(requested, 1)
        self.assertEqual(accepted, 0)
        self.assertEqual(metrics["3543402"]["censusStatus"], "PESQUISA_PARCIAL")
        self.assertTrue(any("negative_evidence_recorded" in item for item in metrics["3543402"]["blockers"]))

    def test_complete_is_accepted_only_with_full_protocol(self):
        by_code, by_name = census.geography_indexes(self.municipios)
        row = {
            "ibge_code": "3550308",
            "municipio": "São Paulo",
            "uf": "SP",
            "protocol_version": census.PROTOCOL_VERSION,
            "reviewed_by": "analista-02",
            "verified_at": "2026-08-22T10:00:00-03:00",
            "confidence": "ALTO",
            "census_status": "CENSO_COMPLETO",
        }
        for field in census.REQUIRED_CHECKS:
            row[field] = "sim"
        coverage = self.write_csv("coverage.csv", self.coverage_fields(), [row])
        metrics = {}

        _, requested, accepted = census.apply_coverage(metrics, coverage, by_code, by_name)

        self.assertEqual(requested, 1)
        self.assertEqual(accepted, 1)
        self.assertEqual(metrics["3550308"]["censusStatus"], "CENSO_COMPLETO")
        self.assertEqual(metrics["3550308"]["blockers"], [])

    def test_presence_never_implies_complete_census(self):
        by_code, by_name = census.geography_indexes(self.municipios)
        presences = self.write_csv(
            "presences.csv",
            ["municipio", "uf", "nome", "categoria"],
            [{"municipio": "Ribeirão Preto", "uf": "SP", "nome": "Concorrente X", "categoria": "GERENCIADORA_GR"}],
        )

        metrics, unmatched = census.load_presences(presences, by_code, by_name)

        self.assertEqual(unmatched, [])
        self.assertEqual(metrics["3543402"]["censusStatus"], "PESQUISA_PARCIAL")
        self.assertEqual(metrics["3543402"]["verifiedPresences"], 1)
        self.assertEqual(metrics["3543402"]["directRiskManagement"], 1)


if __name__ == "__main__":
    unittest.main()
