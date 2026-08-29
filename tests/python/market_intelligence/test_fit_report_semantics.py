from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
MODULE_PATH = ROOT / "scripts" / "market_intelligence" / "generate_municipality_fit_reports.py"
SPEC = importlib.util.spec_from_file_location("fit_report_generator", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FitReportSemanticsTest(unittest.TestCase):
    def test_pending_rntrc_can_be_wave1_without_becoming_confirmed_fit(self) -> None:
        bucket, icp_fit, fit_classe = MODULE.classify_fit_and_bucket(
            "PENDENTE",
            "PIC_2_INVESTIGAR_COMPLIANCE",
        )

        self.assertEqual(bucket, "wave1")
        self.assertEqual(icp_fit, "FIT_SETORIAL_POTENCIAL")
        self.assertEqual(fit_classe, "ALTO_SETORIAL")
        self.assertTrue(MODULE.should_include("wave1", bucket, icp_fit))
        self.assertFalse(MODULE.should_include("confirmed", bucket, icp_fit))

    def test_active_rntrc_is_structurally_confirmed_independent_of_bucket(self) -> None:
        bucket, icp_fit, fit_classe = MODULE.classify_fit_and_bucket(
            "ATIVO",
            "PIC_NAO_INFERIVEL",
        )

        self.assertEqual(bucket, "research")
        self.assertEqual(icp_fit, "FIT_ESTRUTURAL_CONFIRMADO")
        self.assertEqual(fit_classe, "ALTO_CONFIRMADO_RNTRC")
        self.assertTrue(MODULE.should_include("confirmed", bucket, icp_fit))
        self.assertFalse(MODULE.should_include("wave1", bucket, icp_fit))

    def test_no_rntrc_remains_potential_and_nurture(self) -> None:
        bucket, icp_fit, fit_classe = MODULE.classify_fit_and_bucket(
            "NAO",
            "PIC_1_VALIDAR_EXPANSAO",
        )

        self.assertEqual(bucket, "nurture")
        self.assertEqual(icp_fit, "FIT_SETORIAL_POTENCIAL")
        self.assertEqual(fit_classe, "ALTO_SETORIAL")
        self.assertTrue(MODULE.should_include("all", bucket, icp_fit))
        self.assertFalse(MODULE.should_include("confirmed", bucket, icp_fit))
        self.assertFalse(MODULE.should_include("wave1", bucket, icp_fit))


if __name__ == "__main__":
    unittest.main()
