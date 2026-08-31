from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SUMMARY = ROOT / "public" / "tools" / "atlas-market-intelligence" / "data" / "atlas_fit_brasil_audit_summary.json"
TAXONOMY = ROOT / "public" / "tools" / "atlas-market-intelligence" / "icp_taxonomy.v1.json"


class FitBrasilAuditSummaryTest(unittest.TestCase):
    def test_fail_closed_and_arithmetically_consistent(self) -> None:
        summary = json.loads(SUMMARY.read_text(encoding="utf-8"))
        national = summary["national"]
        coverage = summary["coverage"]
        semantics = summary["semantics"]

        self.assertEqual(
            national["candidateUniverse"],
            national["fitEstruturalConfirmado"] + national["fitSetorialPotencial"],
        )
        self.assertEqual(coverage["uniqueCnpj"], national["candidateUniverse"])
        self.assertEqual(national["rntrcActive"], national["fitEstruturalConfirmado"])
        self.assertEqual(coverage["duplicateCnpjOccurrences"], 0)
        self.assertFalse(semantics["decisionReady"])
        self.assertEqual(
            semantics["datasetRole"],
            "CANDIDATE_UNIVERSE_SETORIAL_RNTRC_NOT_FINAL_ICP",
        )
        self.assertIn("ICP final", semantics["blockedUse"])
        self.assertIn(
            "recomendacao final de territorio ou contratacao",
            semantics["blockedUse"],
        )

    def test_cannot_outgrow_current_uncalibrated_taxonomy_semantics(self) -> None:
        summary = json.loads(SUMMARY.read_text(encoding="utf-8"))
        taxonomy = json.loads(TAXONOMY.read_text(encoding="utf-8"))

        self.assertEqual(taxonomy["status"], "REGRA_DE_MODELO_NAO_CALIBRADA")
        self.assertEqual(summary["semantics"]["taxonomyStatus"], taxonomy["status"])
        self.assertIn(
            "nao sao convertidos em receita ou fit automaticamente",
            taxonomy["description"],
        )

    def test_wave1_audit_records_potential_accounts_inside_exported_package(self) -> None:
        summary = json.loads(SUMMARY.read_text(encoding="utf-8"))
        national = summary["national"]
        issue = summary["semantics"]["semanticIssue"]

        self.assertGreater(national["fitSetorialPotencial"], 0)
        self.assertGreater(
            national["candidateUniverse"],
            national["fitEstruturalConfirmado"],
        )
        self.assertIn("wave1", issue)
        self.assertIn("RNTRC PENDENTE", issue)


if __name__ == "__main__":
    unittest.main()
