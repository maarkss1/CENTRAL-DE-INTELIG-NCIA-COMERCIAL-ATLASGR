from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SUMMARY = ROOT / "public" / "tools" / "atlas-market-intelligence" / "data" / "atlas_fit_brasil_audit_summary.json"
TAXONOMY = ROOT / "public" / "tools" / "atlas-market-intelligence" / "icp_taxonomy.v1.json"


def test_fit_brasil_audit_summary_is_fail_closed_and_arithmetically_consistent() -> None:
    summary = json.loads(SUMMARY.read_text(encoding="utf-8"))
    national = summary["national"]
    coverage = summary["coverage"]
    semantics = summary["semantics"]

    assert national["candidateUniverse"] == (
        national["fitEstruturalConfirmado"] + national["fitSetorialPotencial"]
    )
    assert coverage["uniqueCnpj"] == national["candidateUniverse"]
    assert national["rntrcActive"] == national["fitEstruturalConfirmado"]
    assert coverage["duplicateCnpjOccurrences"] == 0
    assert semantics["decisionReady"] is False
    assert semantics["datasetRole"] == "CANDIDATE_UNIVERSE_SETORIAL_RNTRC_NOT_FINAL_ICP"
    assert "ICP final" in semantics["blockedUse"]
    assert "recomendacao final de territorio ou contratacao" in semantics["blockedUse"]


def test_fit_brasil_cannot_outgrow_current_uncalibrated_taxonomy_semantics() -> None:
    summary = json.loads(SUMMARY.read_text(encoding="utf-8"))
    taxonomy = json.loads(TAXONOMY.read_text(encoding="utf-8"))

    assert taxonomy["status"] == "REGRA_DE_MODELO_NAO_CALIBRADA"
    assert summary["semantics"]["taxonomyStatus"] == taxonomy["status"]
    assert "nao sao convertidos em receita ou fit automaticamente" in taxonomy["description"]


def test_wave1_audit_explicitly_records_potential_accounts_inside_exported_package() -> None:
    summary = json.loads(SUMMARY.read_text(encoding="utf-8"))
    national = summary["national"]
    issue = summary["semantics"]["semanticIssue"]

    assert national["fitSetorialPotencial"] > 0
    assert national["candidateUniverse"] > national["fitEstruturalConfirmado"]
    assert "wave1" in issue
    assert "RNTRC PENDENTE" in issue
