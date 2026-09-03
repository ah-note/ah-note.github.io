from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from formal_reports import FormalReport, report_excerpt, report_title
from site_sources import CURRENT_SCHEMA, ResearchDocument


INFORMATION_CUTOFF_RE = re.compile(
    r"截至\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日"
    r"(?:\s*(\d{1,2})\s*[:：]\s*(\d{1,2}))?"
)


@dataclass(frozen=True)
class ResearchFeedEntry:
    source: str
    code: str
    name: str
    market: str
    report_period: str
    published_at: str
    label: str
    page_url: str
    public_url: str
    title: str
    excerpt: str
    analysis_version: str
    review_status: str

    @property
    def publication_date(self) -> str:
        return self.published_at[:10]

    def public_record(self) -> dict[str, str]:
        return {
            "source": self.source,
            "analysis_version": self.analysis_version,
            "code": self.code,
            "name": self.name,
            "market": self.market,
            "report_period": self.report_period,
            "published_at": self.published_at,
            "review_status": self.review_status,
            "title": self.title,
            "excerpt": self.excerpt,
            "url": self.public_url,
        }


def market_for(code: str, company: dict) -> str:
    market = str(company.get("market") or "").strip()
    if market:
        return market
    if code.endswith((".SH", ".SZ", ".BJ")):
        return "A"
    if code.endswith(".HK"):
        return "HK"
    return "US"


def information_cutoff(markdown: str, report_period: str) -> str:
    matches = list(INFORMATION_CUTOFF_RE.finditer(markdown))
    if matches:
        year, month, day, hour, minute = matches[-1].groups()
        return (
            f"{int(year):04d}-{int(month):02d}-{int(day):02d}T"
            f"{int(hour or 0):02d}:{int(minute or 0):02d}:00+08:00"
        )
    try:
        return datetime.fromisoformat(report_period).strftime("%Y-%m-%dT00:00:00+08:00")
    except ValueError:
        return f"{report_period[:10]}T00:00:00+08:00"


def committed_at(path: Path) -> str:
    report_path = path.resolve()
    repository = next((parent for parent in report_path.parents if (parent / ".git").exists()), None)
    if repository is None:
        return ""
    completed = subprocess.run(
        [
            "git",
            "-C",
            str(repository),
            "log",
            "-1",
            "--format=%aI",
            "--",
            str(report_path.relative_to(repository)),
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    return completed.stdout.strip() if completed.returncode == 0 else ""


def current_entry(document: ResearchDocument) -> ResearchFeedEntry | None:
    result = document.result
    if result.get("schema_version") != CURRENT_SCHEMA:
        return None
    company = result.get("company") if isinstance(result.get("company"), dict) else {}
    code = str(company.get("code") or document.result_path.parents[1].name).upper()
    name = str(company.get("display_name") or company.get("name") or code)
    period = str(result.get("period") or document.result_path.parent.name)
    markdown = document.report_path.read_text(encoding="utf-8")
    title = report_title(markdown, name, code)
    if title == f"{name}（{code}）公司研究报告":
        title = f"{name}（{code}）{period[:4]}年公司研究"
    return ResearchFeedEntry(
        source="current_company_research",
        code=code,
        name=name,
        market=market_for(code, company),
        report_period=period,
        published_at=committed_at(document.report_path) or information_cutoff(markdown, period),
        label="当前公司研究",
        page_url=f"../reports/{code}/",
        public_url=f"reports/{code}/",
        title=title,
        excerpt=report_excerpt(markdown),
        analysis_version=CURRENT_SCHEMA,
        review_status="pass",
    )


def formal_entry(report: FormalReport) -> ResearchFeedEntry:
    return ResearchFeedEntry(
        source="formal_report_registry",
        code=report.code,
        name=report.name,
        market=report.market,
        report_period=report.report_period,
        published_at=report.generated_at,
        label="深度研报",
        page_url=report.url,
        public_url=f"research/{report.url}",
        title=report.title,
        excerpt=report.excerpt,
        analysis_version=report.analysis_version,
        review_status=report.review_status,
    )


def build_research_feed(
    documents: list[ResearchDocument],
    formal_reports: list[FormalReport],
) -> list[ResearchFeedEntry]:
    entries: dict[tuple[str, str], ResearchFeedEntry] = {}
    for report in formal_reports:
        entry = formal_entry(report)
        entries[(entry.code, entry.report_period)] = entry
    for document in documents:
        entry = current_entry(document)
        if entry is not None:
            entries[(entry.code, entry.report_period)] = entry
    return sorted(
        entries.values(),
        key=lambda entry: (entry.published_at, entry.source == "current_company_research", entry.code),
        reverse=True,
    )
