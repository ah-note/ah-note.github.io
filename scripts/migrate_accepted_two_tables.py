"""One-off import of the two reader examples accepted before the autonomous protocol."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

from two_table_reports import install_view


def migrate(analysis_root, site_root):
    sys.path.insert(0, str(analysis_root / 'src'))
    from stock_analysis.capital_statement.web_view import build_company_tables_dataset
    reports = {r['code']: r for r in build_company_tables_dataset()['companies']}
    for code, run in [('00837.HK', 'tan-20260913T2217'), ('000683.SZ', 'berun-v2-20260914T1533')]:
        view = reports[code]
        digest = hashlib.sha256(json.dumps(view, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        install_view(view, site_root, digest, '2026-09-15T00:00:00+08:00', '2025-12-31',
                     '2024—2025年度', provenance={'kind': 'accepted-reader-example', 'source_run': run,
                     'projection': 'stock_analysis.capital_statement.web_view.build_company_tables_dataset'})


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--analysis-root', type=Path, required=True)
    parser.add_argument('--site-root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    migrate(args.analysis_root, args.site_root)
