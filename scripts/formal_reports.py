from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


APPROVED_REVIEW_STATUSES = {"pass", "pass_with_warnings"}


@dataclass(frozen=True)
class FormalReport:
    analysis_version: str
    code: str
    name: str
    market: str
    report_period: str
    generated_at: str
    review_status: str
    report_path: Path
    report_sha256: str
    markdown: str
    title: str
    excerpt: str

    @property
    def publication_date(self) -> str:
        try:
            return datetime.fromisoformat(self.generated_at).date().isoformat()
        except ValueError:
            return self.generated_at[:10]

    @property
    def url(self) -> str:
        return f"{self.code}/{self.analysis_version}/"

    def public_record(self) -> dict[str, str]:
        return {
            "analysis_version": self.analysis_version,
            "code": self.code,
            "name": self.name,
            "market": self.market,
            "report_period": self.report_period,
            "generated_at": self.generated_at,
            "review_status": self.review_status,
            "report_sha256": self.report_sha256,
            "title": self.title,
            "excerpt": self.excerpt,
            "url": f"research/{self.url}",
        }


def compact_text(text: str, limit: int = 240) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip("，。；、 ") + "……"


def report_title(markdown: str, name: str, code: str) -> str:
    for line in markdown.splitlines():
        match = re.match(r"^#\s+(.+?)\s*$", line)
        if match:
            return re.sub(r"[*`_]", "", match.group(1)).strip()
    return f"{name}（{code}）公司研究报告"


def report_excerpt(markdown: str) -> str:
    paragraphs: list[tuple[str, str]] = []
    section = ""
    buffer: list[str] = []

    def flush() -> None:
        if not buffer:
            return
        text = " ".join(buffer).strip()
        buffer.clear()
        if text:
            paragraphs.append((section, text))

    in_code = False
    for raw_line in markdown.splitlines():
        line = raw_line.strip()
        if line.startswith("```"):
            in_code = not in_code
            flush()
            continue
        if in_code:
            continue
        heading = re.match(r"^#{1,4}\s+(.+)$", line)
        if heading:
            flush()
            section = heading.group(1).strip()
            continue
        if not line:
            flush()
            continue
        if line.startswith(("|", "- ", "* ", ">")) or re.match(r"^\d+[.)]\s", line):
            flush()
            continue
        buffer.append(line)
    flush()

    excluded = ("折算三表", "审阅", "来源", "口径", "目录")
    candidates = [
        text for heading, text in paragraphs
        if not any(word in heading for word in excluded) and len(text) >= 45
        and not (
            ("报告期" in text and ("市场" in text or "金额" in text))
            or "不构成买卖建议" in text
            or "不提供目标价或买卖建议" in text
        )
    ]
    if not candidates:
        candidates = [text for _, text in paragraphs if len(text) >= 20]
    return compact_text(candidates[0] if candidates else "完整呈现公司的生意模式、经营资产、现金流与价值判断。")


def _review_status(review_json: str) -> str:
    try:
        review = json.loads(review_json or "{}")
    except json.JSONDecodeError:
        return ""
    return str(review.get("status") or "") if isinstance(review, dict) else ""


def load_formal_reports(stock_report_root: Path) -> list[FormalReport]:
    stock_report_root = stock_report_root.resolve()
    database = stock_report_root / "data" / "derived" / "stock_research" / "research.sqlite3"
    if not database.is_file():
        return []

    connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute(
            """
            SELECT rv.analysis_version, rv.code, rv.name, rv.market, rv.report_period,
                   rv.generated_at, rv.report_path, rv.report_sha256,
                   rv.report_review_json, rv.status
              FROM latest_research_versions latest
              JOIN research_versions rv
                ON rv.analysis_version = latest.analysis_version
               AND rv.code = latest.code
               AND rv.report_period = latest.report_period
             ORDER BY rv.generated_at DESC, rv.code
            """
        ).fetchall()
    except sqlite3.DatabaseError:
        return []
    finally:
        connection.close()

    reports: list[FormalReport] = []
    for row in rows:
        review_status = _review_status(row["report_review_json"])
        if row["status"] != "complete" or review_status not in APPROVED_REVIEW_STATUSES:
            continue
        raw_path = Path(str(row["report_path"]))
        report_path = raw_path if raw_path.is_absolute() else stock_report_root / raw_path
        try:
            report_path = report_path.resolve()
            report_path.relative_to(stock_report_root)
        except (OSError, ValueError):
            continue
        if not report_path.is_file():
            continue
        markdown_bytes = report_path.read_bytes()
        actual_sha = hashlib.sha256(markdown_bytes).hexdigest()
        if actual_sha != str(row["report_sha256"]):
            continue
        markdown = markdown_bytes.decode("utf-8")
        reports.append(
            FormalReport(
                analysis_version=str(row["analysis_version"]),
                code=str(row["code"]).upper(),
                name=str(row["name"]),
                market=str(row["market"]),
                report_period=str(row["report_period"]),
                generated_at=str(row["generated_at"]),
                review_status=review_status,
                report_path=report_path,
                report_sha256=actual_sha,
                markdown=markdown,
                title=report_title(markdown, str(row["name"]), str(row["code"])),
                excerpt=report_excerpt(markdown),
            )
        )
    return reports


def formal_report_digest(report: FormalReport) -> str:
    digest = hashlib.sha256()
    digest.update(report.analysis_version.encode("utf-8"))
    digest.update(b"\0")
    digest.update(report.report_sha256.encode("ascii"))
    digest.update(b"\0")
    digest.update(report.review_status.encode("utf-8"))
    return digest.hexdigest()
