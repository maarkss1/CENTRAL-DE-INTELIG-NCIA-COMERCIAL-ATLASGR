#!/usr/bin/env python3
"""Economics Calculator — Atlas Market Intelligence Unit Economics v1.2.

Implementa o modelo de 24 meses definido em METODOLOGIA_UNIT_ECONOMICS_V1_2.md.

Entradas:
  config/economics_policy.json  — premissas editáveis
  data/territorios.json         — territórios com TAM ICP

Saídas:
  data/territorios.json         — atualizado com economics completo por território
  data/economics_summary.json   — resumo comparativo dos territórios
  data/economics.metadata.json

Vereditos:
  PREMISSAS_PENDENTES  — campos obrigatórios ainda null
  POLITICA_PENDENTE    — cálculo disponível, política de autorização ausente
  RECOMENDADO          — todas as regras atendidas
  NAO_RECOMENDADO      — ao menos uma regra econômica violada
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DATA_DIR = Path("data")
CONFIG_DIR = Path("config")
POLICY_PATH = CONFIG_DIR / "economics_policy.json"


def load_json(path: Path) -> Any:
    if not path.exists():
        raise FileNotFoundError(f"Não encontrado: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def check_premissas(policy: dict) -> list[str]:
    """Retorna lista de campos obrigatórios ainda null."""
    comercial = policy.get("commercial", {})
    custo = policy.get("cost", {})
    politica = policy.get("policy", {})
    
    missing = []
    required_commercial = [
        "icp_attendable_pct",
        "ticket_mrr_brl",
        "gross_margin_pct",
        "win_rate_pct",
        "qualified_opps_per_month_at_peak",
        "expected_penetration_on_sam_pct",
    ]
    required_cost = ["monthly_fixed_cost_brl"]
    required_policy = ["max_payback_months", "min_roi_12m_pct"]
    
    for field in required_commercial:
        if comercial.get(field) is None:
            missing.append(f"commercial.{field}")
    for field in required_cost:
        if custo.get(field) is None:
            missing.append(f"cost.{field}")
    # Política é separada — só bloqueia POLITICA_PENDENTE, não PREMISSAS_PENDENTES
    return missing


def check_politica(policy: dict) -> list[str]:
    """Retorna lista de campos de política ainda null."""
    politica = policy.get("policy", {})
    missing = []
    if politica.get("max_payback_months") is None:
        missing.append("policy.max_payback_months")
    if politica.get("min_roi_12m_pct") is None:
        missing.append("policy.min_roi_12m_pct")
    return missing


def simulate_24m(
    *,
    tam: int,
    attendable_pct: float,
    penetration_pct: float,
    ticket_mrr: float,
    gross_margin: float,
    win_rate: float,
    opps_peak: float,
    meeting_to_opp: float,
    churn_monthly: float,
    sales_cycle_months: int,
    commission_new_mrr: float,
    monthly_fixed_cost: float,
    initial_investment: float,
    rampup_months: int,
    rampup_curve: list[float],
    scenario_factor: float = 1.0,
) -> dict[str, Any]:
    """Simula o modelo de 24 meses."""
    sam = int(tam * attendable_pct)
    som = int(sam * penetration_pct)
    
    mrr_list = [0.0] * 25  # índice 0 = mês 0 (pré-operação), 1..24
    cumulative_cost = initial_investment
    cumulative_revenue = 0.0
    active_clients = 0
    
    def productivity_factor(month: int) -> float:
        if month <= 0:
            return 0.0
        if month <= rampup_months and rampup_months > 0:
            idx = min(month - 1, len(rampup_curve) - 1)
            return rampup_curve[idx]
        return rampup_curve[-1] if rampup_curve else 1.0
    
    monthly_data = []
    for m in range(1, 25):
        prod = productivity_factor(m) * scenario_factor
        opps = opps_peak * prod
        new_contracts_potential = opps * win_rate
        
        # Contratos fechados neste mês chegam após sales_cycle
        if m > sales_cycle_months:
            new_clients = min(new_contracts_potential, max(0, som - active_clients))
        else:
            new_clients = 0
        
        churned = active_clients * churn_monthly
        active_clients = max(0, active_clients + new_clients - churned)
        active_clients = min(active_clients, som)
        
        mrr_month = active_clients * ticket_mrr
        mrr_list[m] = mrr_month
        
        gross_revenue = mrr_month * gross_margin
        commission = new_clients * ticket_mrr * commission_new_mrr
        fixed_cost = monthly_fixed_cost
        
        net_month = gross_revenue - commission - fixed_cost
        cumulative_cost += fixed_cost + commission
        cumulative_revenue += gross_revenue
        
        monthly_data.append({
            "month": m,
            "activeClients": round(active_clients, 1),
            "mrr": round(mrr_month, 2),
            "grossRevenue": round(gross_revenue, 2),
            "netMonth": round(net_month, 2),
            "cumulativeNet": round(cumulative_revenue - cumulative_cost, 2),
        })
    
    mrr_12 = mrr_list[12]
    mrr_24 = mrr_list[24]
    total_net = cumulative_revenue - cumulative_cost
    
    # Payback: mês em que o cumulativo fica positivo
    cumulative_running = -initial_investment
    payback = None
    for md in monthly_data:
        cumulative_running = md["cumulativeNet"]
        if cumulative_running >= 0 and payback is None:
            payback = md["month"]
    
    roi_12 = (mrr_12 * 12 * gross_margin - monthly_fixed_cost * 12 - initial_investment) / max(monthly_fixed_cost * 12 + initial_investment, 1)
    roi_24 = (mrr_24 * 24 * gross_margin - monthly_fixed_cost * 24 - initial_investment) / max(monthly_fixed_cost * 24 + initial_investment, 1)
    
    # Break-even
    # MRR de break-even: margem cobre custo fixo → MRR_BE = fixed_cost / gross_margin
    mrr_breakeven = monthly_fixed_cost / max(gross_margin, 0.01)
    contracts_breakeven = math.ceil(mrr_breakeven / max(ticket_mrr, 0.01))
    opps_breakeven = math.ceil(contracts_breakeven / max(win_rate, 0.01))
    meetings_breakeven = math.ceil(opps_breakeven / max(meeting_to_opp, 0.01))
    pipeline_breakeven = opps_breakeven * ticket_mrr
    
    # Guardrail: SOM < break-even → inviável
    som_viable = som >= contracts_breakeven
    
    return {
        "tam": tam,
        "sam": sam,
        "som": som,
        "somViable": som_viable,
        "mrrBreakeven": round(mrr_breakeven, 2),
        "contractsBreakeven": contracts_breakeven,
        "oppsBreakeven": opps_breakeven,
        "meetingsBreakeven": meetings_breakeven,
        "pipelineMrrBreakeven": round(pipeline_breakeven, 2),
        "paybackMonths": payback,
        "roi12m": round(roi_12, 4),
        "roi24m": round(roi_24, 4),
        "mrr12": round(mrr_12, 2),
        "mrr24": round(mrr_24, 2),
        "monthly": monthly_data,
    }


def evaluate_territory(territory: dict, policy: dict, scenario: str = "base") -> dict[str, Any]:
    """Calcula economics para um território."""
    missing_premissas = check_premissas(policy)
    missing_politica = check_politica(policy)
    
    if missing_premissas:
        return {
            "verdict": "PREMISSAS_PENDENTES",
            "missingFields": missing_premissas,
            "scenario": scenario,
        }
    
    c = policy["commercial"]
    cost = policy["cost"]
    ramp = policy.get("rampup", {})
    pol = policy.get("policy", {})
    scenarios_cfg = policy.get("scenarios", {})
    
    factor_map = {
        "conservative": scenarios_cfg.get("conservative_factor", 0.70),
        "base": scenarios_cfg.get("base_factor", 1.00),
        "aggressive": scenarios_cfg.get("aggressive_factor", 1.30),
    }
    
    tam = territory.get("icp", {}).get("total", 0) or 0
    
    result = simulate_24m(
        tam=tam,
        attendable_pct=c["icp_attendable_pct"],
        penetration_pct=c["expected_penetration_on_sam_pct"],
        ticket_mrr=c["ticket_mrr_brl"],
        gross_margin=c["gross_margin_pct"],
        win_rate=c["win_rate_pct"],
        opps_peak=c["qualified_opps_per_month_at_peak"],
        meeting_to_opp=c.get("meeting_to_opp_conversion_pct", 0.30),
        churn_monthly=c.get("monthly_churn_pct", 0.02),
        sales_cycle_months=int(c.get("sales_cycle_months", 2)),
        commission_new_mrr=c.get("commission_on_new_mrr_pct", 0.10),
        monthly_fixed_cost=cost["monthly_fixed_cost_brl"],
        initial_investment=cost.get("initial_investment_brl", 0.0),
        rampup_months=int(ramp.get("rampup_months", 3)),
        rampup_curve=ramp.get("rampup_productivity_curve", [0.30, 0.60, 0.85, 1.0]),
        scenario_factor=factor_map.get(scenario, 1.0),
    )
    
    # Veredito econômico
    if missing_politica:
        verdict = "POLITICA_PENDENTE"
        verdict_reasons = missing_politica
    else:
        max_payback = pol["max_payback_months"]
        min_roi_12 = pol["min_roi_12m_pct"]
        min_roi_24 = pol.get("min_roi_24m_pct")
        
        fails = []
        if not result["somViable"]:
            fails.append(f"SOM ({result['som']}) < break-even ({result['contractsBreakeven']} contratos)")
        if result["paybackMonths"] is None or result["paybackMonths"] > max_payback:
            fails.append(f"payback ({result['paybackMonths']}) > máximo ({max_payback} meses)")
        if result["roi12m"] < min_roi_12:
            fails.append(f"ROI 12m ({result['roi12m']:.1%}) < mínimo ({min_roi_12:.1%})")
        if min_roi_24 and result["roi24m"] < min_roi_24:
            fails.append(f"ROI 24m ({result['roi24m']:.1%}) < mínimo ({min_roi_24:.1%})")
        
        if fails:
            verdict = "NAO_RECOMENDADO"
            verdict_reasons = fails
        else:
            verdict = "RECOMENDADO"
            verdict_reasons = []
    
    return {
        "verdict": verdict,
        "verdictReasons": verdict_reasons,
        "scenario": scenario,
        **result,
    }


def main() -> int:
    print("=== Economics Calculator v1.2 ===")

    policy = load_json(POLICY_PATH)
    territorios = load_json(DATA_DIR / "territorios.json")

    missing = check_premissas(policy)
    if missing:
        print(f"\n  PREMISSAS_PENDENTES: {len(missing)} campo(s) null:")
        for f in missing:
            print(f"    - {f}")
        print("\n  Calcular economics parciais (tam/sam/som onde possível)...")
    
    missing_pol = check_politica(policy)
    if missing_pol and not missing:
        print(f"\n  POLITICA_PENDENTE: {len(missing_pol)} campo(s) de política null.")

    summaries = []
    for t in territorios:
        t_id = t.get("id", "")
        base_city = t.get("baseCity", "")
        uf = t.get("uf", "")
        
        eco_scenarios = {}
        for scenario in ("conservative", "base", "aggressive"):
            eco_scenarios[scenario] = evaluate_territory(t, policy, scenario)
        
        # Usar cenário base como principal
        base_eco = eco_scenarios["base"]
        
        t["economics"] = {
            "tamAccounts": t.get("icp", {}).get("total", 0),
            "samAccounts": base_eco.get("sam"),
            "somAccounts": base_eco.get("som"),
            "verdict": base_eco.get("verdict"),
            "verdictReasons": base_eco.get("verdictReasons", []),
            "mrrBreakeven": base_eco.get("mrrBreakeven"),
            "contractsBreakeven": base_eco.get("contractsBreakeven"),
            "oppsBreakeven": base_eco.get("oppsBreakeven"),
            "meetingsBreakeven": base_eco.get("meetingsBreakeven"),
            "pipelineMrrBreakeven": base_eco.get("pipelineMrrBreakeven"),
            "potentialMrr": base_eco.get("mrr24"),
            "mrr12": base_eco.get("mrr12"),
            "mrr24": base_eco.get("mrr24"),
            "paybackMonths": base_eco.get("paybackMonths"),
            "roi12m": base_eco.get("roi12m"),
            "roi24m": base_eco.get("roi24m"),
            "scenarios": eco_scenarios,
            "policyVersion": policy.get("_version", "1.0.0"),
        }
        
        summaries.append({
            "id": t_id,
            "baseCity": base_city,
            "uf": uf,
            "opportunityScore": t.get("opportunityScore"),
            "verdict": base_eco.get("verdict"),
            "tam": base_eco.get("tam"),
            "sam": base_eco.get("sam"),
            "som": base_eco.get("som"),
            "mrr12": base_eco.get("mrr12"),
            "mrr24": base_eco.get("mrr24"),
            "paybackMonths": base_eco.get("paybackMonths"),
            "roi12m": base_eco.get("roi12m"),
        })
        
        verdict = base_eco.get("verdict", "?")
        print(f"  {base_city}/{uf}: {verdict}")

    # Salvar territorios.json atualizado
    (DATA_DIR / "territorios.json").write_text(
        json.dumps(territorios, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    # Salvar summary
    summary_path = DATA_DIR / "economics_summary.json"
    summary_path.write_text(
        json.dumps(summaries, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    metadata = {
        "dataset": "Unit Economics Territorial — Atlas Market Intelligence v1.2",
        "processedAt": datetime.now(timezone.utc).isoformat(),
        "policyVersion": policy.get("_version", "1.0.0"),
        "policyStatus": policy.get("_status", "PREMISSAS_PENDENTES"),
        "missingPremissas": missing,
        "missingPolitica": missing_pol,
        "territoriesEvaluated": len(territorios),
        "verdicts": {
            v: sum(1 for s in summaries if s["verdict"] == v)
            for v in ("PREMISSAS_PENDENTES", "POLITICA_PENDENTE", "RECOMENDADO", "NAO_RECOMENDADO")
        },
    }
    meta_path = DATA_DIR / "economics.metadata.json"
    meta_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
