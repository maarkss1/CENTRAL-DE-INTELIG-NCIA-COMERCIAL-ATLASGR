from __future__ import annotations

import sys
import unittest
from pathlib import Path

MODULE_DIR = Path(__file__).resolve().parents[3] / "public" / "tools" / "atlas-market-intelligence"
sys.path.insert(0, str(MODULE_DIR))

from etl_municipal_aggregate import (  # noqa: E402
    ScoreComponent,
    build_records,
    calculate_opportunity_score,
    geometric_confidence,
    percentile_scores,
)


class PercentileScoresTests(unittest.TestCase):
    def test_highest_value_gets_percentile_100(self) -> None:
        result = percentile_scores({"a": 10, "b": 50, "c": 100})
        self.assertEqual(result["c"], 100.0)
        self.assertEqual(result["a"], 0.0)
        self.assertEqual(result["b"], 50.0)

    def test_ties_share_the_average_rank(self) -> None:
        result = percentile_scores({"a": 10, "b": 10, "c": 30})
        self.assertEqual(result["a"], result["b"])
        self.assertLess(result["a"], result["c"])

    def test_single_value_is_percentile_zero(self) -> None:
        self.assertEqual(percentile_scores({"only": 42}), {"only": 0.0})

    def test_empty_input_returns_empty(self) -> None:
        self.assertEqual(percentile_scores({}), {})


class GeometricConfidenceTests(unittest.TestCase):
    def test_any_zero_confidence_zeroes_the_aggregate(self) -> None:
        self.assertEqual(geometric_confidence([(0.5, 0.9), (0.5, 0.0)]), 0.0)

    def test_equal_confidences_return_the_same_value(self) -> None:
        self.assertAlmostEqual(geometric_confidence([(0.5, 0.8), (0.5, 0.8)]), 0.8)

    def test_no_active_weights_returns_zero(self) -> None:
        self.assertEqual(geometric_confidence([(0.0, 0.9)]), 0.0)


class OpportunityScoreBlockingTests(unittest.TestCase):
    def test_blocked_when_any_weighted_component_is_missing(self) -> None:
        inputs = {
            "icp": ScoreComponent(80.0, 0.9, "OBSERVADO"),
            "rntrc": ScoreComponent(70.0, 0.9, "OBSERVADO"),
            "mdfe": ScoreComponent(None, 0.0, "NAO_DISPONIVEL"),
            "need": ScoreComponent(None, 0.0, "NAO_DISPONIVEL"),
            "whiteSpace": ScoreComponent(None, 0.0, "NAO_DISPONIVEL"),
            "territorialEfficiency": ScoreComponent(None, 0.0, "NAO_DISPONIVEL"),
        }
        result = calculate_opportunity_score(inputs)
        self.assertIsNone(result["raw"])
        self.assertIsNone(result["adjusted"])
        self.assertTrue(result["blockedReasons"])

    def test_computes_weighted_average_when_all_components_present(self) -> None:
        full = ScoreComponent(100.0, 1.0, "OBSERVADO")
        inputs = {key: full for key in ("icp", "rntrc", "mdfe", "need", "whiteSpace", "territorialEfficiency")}
        result = calculate_opportunity_score(inputs)
        self.assertAlmostEqual(result["raw"], 100.0)
        self.assertAlmostEqual(result["adjusted"], 100.0)
        self.assertEqual(result["blockedReasons"], [])


class BuildRecordsTests(unittest.TestCase):
    def test_joins_by_ibge_code_and_never_fabricates_missing_datasets(self) -> None:
        municipios = [
            {"ibgeCode": "1", "name": "Alfa", "uf": "SP", "region": "Sudeste", "latitude": -1.0, "longitude": -2.0},
            {"ibgeCode": "2", "name": "Beta", "uf": "SP", "region": "Sudeste", "latitude": -3.0, "longitude": -4.0},
        ]
        icp_by_code = {"1": {"total": 100, "tierA": 50, "tierB": 30, "tierC": 20}}
        rntrc_by_code = {"1": {"transporters": 10, "etc": 1, "tac": 2, "ctc": 3, "etcEquiparada": 0}}
        senatran_by_code = {"1": {"cargoFleet": 40, "byType": {"CAMINHAO": 10, "CAMINHAO TRATOR": 5, "REBOQUE": 3, "SEMI REBOQUE": 2}}}
        competition_by_code: dict = {}

        records, stats = build_records(municipios, icp_by_code, rntrc_by_code, senatran_by_code, competition_by_code)
        self.assertEqual(stats["total"], 2)
        self.assertEqual(stats["with_icp"], 1)

        by_code = {row["ibgeCode"]: row for row in records}
        alfa, beta = by_code["1"], by_code["2"]

        self.assertEqual(alfa["scores"]["demand"]["availability"], "OBSERVADO")
        self.assertEqual(alfa["rntrc"]["tractionVehicles"], 15)
        self.assertEqual(alfa["rntrc"]["implements"], 5)

        self.assertEqual(beta["scores"]["demand"]["availability"], "NAO_DISPONIVEL")
        self.assertIsNone(beta["icp"]["total"])
        self.assertIsNone(beta["rntrc"]["activeVehicles"])
        self.assertIsNone(beta["scores"]["rawOpportunity"]["value"])

    def test_mdfe_trips_sum_origin_and_destination_and_unblock_only_that_component(self) -> None:
        municipios = [
            {"ibgeCode": "1", "name": "Alfa", "uf": "SP", "region": "Sudeste", "latitude": -1.0, "longitude": -2.0},
        ]
        mdfe_origins = {"1": {"trips": 30}}
        mdfe_destinations = {"1": {"trips": 12}}

        records, stats = build_records(municipios, {}, {}, {}, {}, mdfe_origins, mdfe_destinations)
        self.assertEqual(stats["with_mdfe"], 1)

        row = records[0]
        self.assertEqual(row["mdfe"]["trips"], 42)
        self.assertIn("mdfe-ciot", row["evidenceIds"])
        # opportunity continua bloqueado (need/whiteSpace/territorialEfficiency ausentes),
        # mas o motivo nao deve mais citar "mdfe" -- esse componente ja esta OBSERVADO.
        self.assertIsNone(row["scores"]["rawOpportunity"]["value"])
        self.assertNotIn("mdfe:", row["scores"]["rawOpportunity"]["reason"])

    def test_risk_is_proxy_uf_shared_across_municipalities_in_the_same_uf(self) -> None:
        municipios = [
            {"ibgeCode": "1", "name": "Alfa", "uf": "SP", "region": "Sudeste", "latitude": -1.0, "longitude": -2.0},
            {"ibgeCode": "2", "name": "Beta", "uf": "SP", "region": "Sudeste", "latitude": -3.0, "longitude": -4.0},
            {"ibgeCode": "3", "name": "Gama", "uf": "GO", "region": "Centro-Oeste", "latitude": -5.0, "longitude": -6.0},
        ]
        risk_by_uf = {
            "SP": {"uf": "SP", "cargoRobbery": 100, "vehicleRobbery": 50, "vehicleTheft": 200},
        }

        records, stats = build_records(municipios, {}, {}, {}, {}, risk_by_uf=risk_by_uf)
        self.assertEqual(stats["with_risk_proxy"], 2)  # so as 2 de SP, nao a de GO

        by_code = {row["ibgeCode"]: row for row in records}
        alfa, beta, gama = by_code["1"], by_code["2"], by_code["3"]

        self.assertEqual(alfa["risk"], beta["risk"])  # mesmo valor de UF compartilhado
        self.assertEqual(alfa["risk"]["cargoRobbery"], 100)
        self.assertEqual(alfa["risk"]["geography"], "PROXY_UF")
        self.assertEqual(alfa["scores"]["risk"]["availability"], "PROXY")
        self.assertIn("sinesp-vde-uf", alfa["evidenceIds"])

        self.assertEqual(gama["risk"]["geography"], "NAO_DISPONIVEL")
        self.assertEqual(gama["scores"]["risk"]["availability"], "NAO_DISPONIVEL")
        self.assertNotIn("sinesp-vde-uf", gama["evidenceIds"])


if __name__ == "__main__":
    unittest.main()
