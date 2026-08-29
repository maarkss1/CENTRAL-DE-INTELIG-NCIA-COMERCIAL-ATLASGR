from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
MODULE_PATH = ROOT / "scripts" / "market_intelligence" / "generate_municipality_fit_reports.py"
SPEC = importlib.util.spec_from_file_location("fit_report_generator", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_pending_rntrc_can_be_wave1_without_becoming_confirmed_fit() -> None:
    bucket, icp_fit, fit_classe = MODULE.classify_fit_and_bucket(
        "PENDENTE",
        "PIC_2_INVESTIGAR_COMPLIANCE",
    )

    assert bucket == "wave1"
    assert icp_fit == "FIT_SETORIAL_POTENCIAL"
    assert fit_classe == "ALTO_SETORIAL"
    assert MODULE.should_include("wave1", bucket, icp_fit) is True
    assert MODULE.should_include("confirmed", bucket, icp_fit) is False


def test_active_rntrc_is_structurally_confirmed_independent_of_bucket() -> None:
    bucket, icp_fit, fit_classe = MODULE.classify_fit_and_bucket(
        "ATIVO",
        "PIC_NAO_INFERIVEL",
    )

    assert bucket == "research"
    assert icp_fit == "FIT_ESTRUTURAL_CONFIRMADO"
    assert fit_classe == "ALTO_CONFIRMADO_RNTRC"
    assert MODULE.should_include("confirmed", bucket, icp_fit) is True
    assert MODULE.should_include("wave1", bucket, icp_fit) is False


def test_no_rntrc_remains_potential_and_nurture() -> None:
    bucket, icp_fit, fit_classe = MODULE.classify_fit_and_bucket(
        "NAO",
        "PIC_1_VALIDAR_EXPANSAO",
    )

    assert bucket == "nurture"
    assert icp_fit == "FIT_SETORIAL_POTENCIAL"
    assert fit_classe == "ALTO_SETORIAL"
    assert MODULE.should_include("all", bucket, icp_fit) is True
    assert MODULE.should_include("confirmed", bucket, icp_fit) is False
    assert MODULE.should_include("wave1", bucket, icp_fit) is False
