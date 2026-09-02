from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


UNIFIED_SCHEMA = "stock-research-result-v1"
CURRENT_SCHEMA = "stock-research-analysis-v2"
REQUIRED_CURRENT_REVIEWS = {
    "capital_return_interpretability",
    "source_traceability",
    "economic_classification",
    "stable_state",
    "report_consistency",
}


@dataclass(frozen=True)
class ResearchDocument:
    result: dict[str, Any]
    result_path: Path
    report_path: Path
    priority: int


def first_value(*values: Any) -> Any:
    for value in values:
        if value is not None:
            return value
    return None


def ratio(numerator: Any, denominator: Any) -> float | None:
    if not isinstance(numerator, (int, float)) or not isinstance(denominator, (int, float)) or denominator == 0:
        return None
    return float(numerator) / float(denominator)


def nested_value(payload: dict[str, Any], *path: str) -> Any:
    current: Any = payload
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    if isinstance(current, dict) and "value" in current:
        return current.get("value")
    return current


def normalize_current_result(result: dict[str, Any], result_path: Path) -> dict[str, Any]:
    company = result.get("company") if isinstance(result.get("company"), dict) else {}
    period = result.get("period") if isinstance(result.get("period"), dict) else {}
    units = result.get("units") if isinstance(result.get("units"), dict) else {}
    revenue = nested_value(result, "fields", "actual", "revenue")
    parent_profit = nested_value(result, "fields", "actual", "parent_profit")
    gross_margin = nested_value(result, "computed", "actual", "gross_margin")
    metrics = {
        "revenue": revenue,
        "gross_profit": revenue * gross_margin if isinstance(revenue, (int, float)) and isinstance(gross_margin, (int, float)) else None,
        "gross_margin": gross_margin,
        "operating_profit": nested_value(result, "computed", "actual", "ebit"),
        "parent_net_profit": parent_profit,
        "net_margin": ratio(parent_profit, revenue),
        "operating_free_cash_flow": nested_value(result, "computed", "actual", "fcff"),
        "operating_business_price": nested_value(result, "computed", "valuation", "business_value"),
    }
    return {
        "schema_version": CURRENT_SCHEMA,
        "company": company,
        "period": period.get("end") or result_path.parent.name,
        "currency": units.get("financial_currency") or "CNY",
        "metrics": metrics,
        "sections": {},
        "business": {},
        "owner_earnback": {},
        "risk_assessment": [],
        "risks": [],
        "data_quality": {"status": "complete"},
        "analysis": result,
    }


def normalize_result(result: dict[str, Any], result_path: Path) -> dict[str, Any]:
    if result.get("schema_version") == CURRENT_SCHEMA:
        return normalize_current_result(result, result_path)
    if result.get("schema_version") != UNIFIED_SCHEMA:
        normalized = dict(result)
        normalized.setdefault("schema_version", "legacy")
        normalized.setdefault("period", result_path.parent.name)
        normalized.setdefault("currency", "CNY")
        normalized.setdefault("business", {})
        normalized.setdefault("owner_earnback", {})
        return normalized

    company = result.get("company") if isinstance(result.get("company"), dict) else {}
    analysis = result.get("analysis") if isinstance(result.get("analysis"), dict) else {}
    valuation = result.get("valuation") if isinstance(result.get("valuation"), dict) else {}
    source_metrics = result.get("metrics") if isinstance(result.get("metrics"), dict) else {}
    financials = result.get("financials") if isinstance(result.get("financials"), dict) else {}
    balance = financials.get("balance_sheet") if isinstance(financials.get("balance_sheet"), dict) else {}
    income = financials.get("income_statement") if isinstance(financials.get("income_statement"), dict) else {}
    cash_flow = financials.get("cash_flow") if isinstance(financials.get("cash_flow"), dict) else {}
    earnback = result.get("owner_earnback") if isinstance(result.get("owner_earnback"), dict) else {}
    dividend = result.get("dividend") if isinstance(result.get("dividend"), dict) else {}

    market_cap = first_value(source_metrics.get("market_cap"), valuation.get("market_cap"))
    discounted_cash = first_value(
        source_metrics.get("discounted_net_cash"),
        earnback.get("discounted_detachable_net_cash"),
    )
    discounted_profit = first_value(
        source_metrics.get("discounted_cash_profit"),
        earnback.get("discounted_sustainable_cash_profit"),
    )
    operating_price = first_value(
        source_metrics.get("operating_business_price"),
        earnback.get("operating_business_price"),
    )
    market_payback = first_value(
        source_metrics.get("market_cap_to_cash_profit"),
        earnback.get("market_profit_payback_years"),
    )

    metrics = dict(source_metrics)
    metrics.update(
        {
            "market_cap": market_cap,
            "pe_ttm": first_value(source_metrics.get("pe_ttm"), valuation.get("pe_ttm")),
            "discounted_detachable_net_cash": discounted_cash,
            "discounted_sustainable_cash_profit": discounted_profit,
            "operating_business_price": operating_price,
            "owner_earnback_years": first_value(
                source_metrics.get("owner_earnback_years"),
                earnback.get("owner_earnback_years"),
            ),
            "owner_earnback_rate": ratio(discounted_profit, operating_price),
            "market_profit_payback_years": market_payback,
            "market_cash_profit_yield": ratio(discounted_profit, market_cap),
            "discounted_net_cash_to_market_cap": first_value(
                source_metrics.get("discounted_net_cash_to_market_cap"),
                ratio(discounted_cash, market_cap),
            ),
            "forecast_dividend_yield": first_value(
                source_metrics.get("forecast_dividend_yield"),
                dividend.get("forecast_dividend_yield"),
            ),
            "total_assets": balance.get("total_assets"),
            "total_liabilities": balance.get("total_liabilities"),
            "total_equity": balance.get("total_equity"),
            "parent_equity": balance.get("parent_equity"),
            "minority_interest": balance.get("minority_interest"),
            "revenue": income.get("revenue"),
            "cost_of_sales": income.get("cost_of_sales"),
            "gross_profit": income.get("gross_profit"),
            "operating_profit": income.get("operating_profit"),
            "net_profit": income.get("net_profit"),
            "parent_net_profit": income.get("parent_net_profit"),
            "operating_cash_flow": cash_flow.get("operating_cash_flow"),
            "capital_expenditure": cash_flow.get("capital_expenditure"),
            "operating_free_cash_flow": cash_flow.get("operating_free_cash_flow"),
        }
    )
    return {
        "schema_version": UNIFIED_SCHEMA,
        "company": company,
        "period": analysis.get("period") or result_path.parent.name,
        "currency": analysis.get("currency") or "CNY",
        "metrics": metrics,
        "sections": {},
        "business": result.get("business") if isinstance(result.get("business"), dict) else {},
        "owner_earnback": earnback,
        "risk_assessment": [],
        "risks": result.get("risks") if isinstance(result.get("risks"), list) else [],
        "data_quality": result.get("data_quality") if isinstance(result.get("data_quality"), dict) else {},
        "analysis": analysis,
    }


def schema_rank(result: dict[str, Any]) -> int:
    return {CURRENT_SCHEMA: 2, UNIFIED_SCHEMA: 1}.get(result.get("schema_version"), 0)


def is_publishable(result: dict[str, Any]) -> bool:
    if result.get("schema_version") == CURRENT_SCHEMA:
        analysis = result.get("analysis") if isinstance(result.get("analysis"), dict) else {}
        review = analysis.get("review") if isinstance(analysis.get("review"), dict) else {}
        passed_reviews = {
            key for key, value in review.items()
            if isinstance(value, dict) and value.get("passed") is True
        }
        return REQUIRED_CURRENT_REVIEWS <= passed_reviews and all(
            isinstance(nested_value(analysis, *path), (int, float))
            for path in [
                ("computed", "actual", "fcff"),
                ("computed", "stable", "fcff"),
                ("computed", "valuation", "common_equity_value"),
            ]
        )
    if result.get("schema_version") != UNIFIED_SCHEMA:
        return True
    quality = result.get("data_quality") if isinstance(result.get("data_quality"), dict) else {}
    return quality.get("status") in {"complete", "partial"}


def load_research_documents(legacy_root: Path | None, stock_report_root: Path | None) -> list[ResearchDocument]:
    roots: list[tuple[int, Path]] = []
    if legacy_root and legacy_root.exists():
        roots.append((0, legacy_root))
    if stock_report_root:
        canonical_root = stock_report_root / "data" / "analysis" / "stock_research"
        if canonical_root.exists() and all(canonical_root.resolve() != path.resolve() for _, path in roots):
            roots.append((1, canonical_root))

    by_code_period: dict[tuple[str, str], ResearchDocument] = {}
    for priority, root in roots:
        for result_path in sorted(root.glob("*/*/result.json")):
            report_path = result_path.with_name("report.md")
            if not report_path.is_file():
                continue
            raw_result = json.loads(result_path.read_text(encoding="utf-8"))
            result = normalize_result(raw_result, result_path)
            if not is_publishable(result):
                continue
            company = result.get("company") if isinstance(result.get("company"), dict) else {}
            code = str(company.get("code") or result_path.parents[1].name).upper()
            period = str(result.get("period") or result_path.parent.name)
            key = (code, period)
            candidate = ResearchDocument(result, result_path, report_path, priority)
            current = by_code_period.get(key)
            if current is None or (schema_rank(result), priority) >= (
                schema_rank(current.result),
                current.priority,
            ):
                by_code_period[key] = candidate

    latest_by_code: dict[str, ResearchDocument] = {}
    for document in by_code_period.values():
        company = document.result.get("company") or {}
        code = str(company.get("code") or document.result_path.parents[1].name).upper()
        current = latest_by_code.get(code)
        candidate_key = (
            str(document.result.get("period") or ""),
            schema_rank(document.result),
            document.priority,
        )
        current_key = (
            str(current.result.get("period") or ""),
            schema_rank(current.result),
            current.priority,
        ) if current else None
        if current_key is None or candidate_key >= current_key:
            latest_by_code[code] = document
    return [latest_by_code[code] for code in sorted(latest_by_code)]
