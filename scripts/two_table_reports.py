"""Publish Agent reader views and preserve historical research addresses."""
from __future__ import annotations

import argparse
import hashlib
import html
import json
from pathlib import Path
import re
import subprocess
import sys

from research_feed import ResearchFeedEntry, market_for
from dataclasses import replace


def public_view(value):
    """Transport financial content unchanged; omit runtime filesystem metadata."""
    if isinstance(value, list): return [public_view(v) for v in value]
    if not isinstance(value, dict): return value
    output = {}
    for key, v in value.items():
        if key in {'local_file', 'original_path'}: continue
        if key == 'path' and isinstance(v, str) and not v.startswith(('https://', 'http://')): continue
        output[key] = public_view(v)
    return output


def catalog(root):
    file = root / 'data/two-table/catalog.json'
    return json.loads(file.read_text()) if file.exists() else {'version': 1, 'companies': []}


def merge_feed(feed, root):
    entries = catalog(root)['companies']
    codes = {e['code'] for e in entries}
    combined = [e for e in feed if e.code not in codes]
    combined.extend(ResearchFeedEntry(
        source='company_two_table', code=e['code'], name=e['name'], market=market_for(e['code'], {}),
        report_period=e['report_end'], published_at=e['completed_at'], label='资产表与经营表',
        page_url=f"./{e['code']}/", public_url=f"research/{e['code']}/",
        title=f"{e['name']}（{e['code']}）", excerpt=e['coverage'],
        analysis_version='autonomous-two-table-v1', review_status='pass') for e in entries)
    stocks_file = root / 'data/stocks.json'
    if stocks_file.exists():
        for stock in json.loads(stocks_file.read_text()).get('stocks', []):
            code = stock['code']
            if not re.fullmatch(r'[A-Za-z0-9._-]+', code) or not (root / 'reports' / code / 'index.html').is_file(): continue
            combined.append(ResearchFeedEntry(
                source='legacy_report', code=code, name=stock['name'], market=stock.get('market', ''),
                report_period=stock.get('period', ''), published_at='', label='报告',
                page_url=f'/reports/{code}/', public_url=f'reports/{code}/',
                title=f"{stock['name']}（{code}）", excerpt=stock.get('business_summary') or '',
                analysis_version=stock.get('schema_version', 'legacy'), review_status='published'))
    rank = {'company_two_table': 3, 'current_company_research': 2, 'formal_report_registry': 2, 'legacy_report': 1}
    selected = {}
    for entry in combined:
        old = selected.get(entry.code)
        if old is None or (rank.get(entry.source, 1), entry.published_at, entry.report_period) > (rank.get(old.source, 1), old.published_at, old.report_period):
            selected[entry.code] = entry
    return sorted((replace(e, page_url='/' + e.public_url.lstrip('/'),
                           label='双表' if e.source == 'company_two_table' else '深度研报' if rank.get(e.source) == 2 else '报告')
                   for e in selected.values()), key=lambda e: (rank.get(e.source, 1), e.published_at, e.code), reverse=True)


def refresh_index(root):
    from build_site import render_research_index
    file = root / 'data/research.json'
    records = json.loads(file.read_text())['reports'] if file.exists() else []
    feed = [ResearchFeedEntry(
        source=r['source'], code=r['code'], name=r['name'], market=r.get('market', ''),
        report_period=r['report_period'], published_at=r['published_at'],
        label='当前公司研究' if r['source'] == 'current_company_research' else '深度研报',
        page_url='../' + r['url'], public_url=r['url'], title=r['title'], excerpt=r.get('excerpt', ''),
        analysis_version=r['analysis_version'], review_status=r.get('review_status', 'pass')) for r in records]
    merged = merge_feed(feed, root)
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps({'reports': [e.public_record() for e in merged]}, ensure_ascii=False, indent=2) + '\n')
    (root / 'research').mkdir(exist_ok=True)
    (root / 'research/index.html').write_text(render_research_index(merged))
    (root / 'capital').mkdir(exist_ok=True)
    (root / 'capital/index.html').write_text(render_research_index(merged))


def install(source, root, analysis_root):
    validator = analysis_root / 'agent_definitions/company_two_table/skills/company-two-table/scripts/protocol.py'
    done = subprocess.run([sys.executable, str(validator), 'validate', '--result', str(source)], capture_output=True, text=True)
    if done.returncode: raise ValueError(done.stderr or done.stdout)
    raw = source.read_bytes(); result = json.loads(raw)
    delivery = result.get('delivery', {})
    if (result.get('workflow_contract') != 'autonomous-two-table-v1' or delivery.get('success') is not True
            or delivery.get('block') is not None or not delivery.get('summary')):
        raise ValueError('AGENT_DELIVERY_REQUIRED')
    years = [p for p, m in result['period_metadata'].items() if m['kind'] == 'annual']
    return install_view(result['reader_view'], root, hashlib.sha256(raw).hexdigest(),
                        delivery['completed_at'], result['disclosure_resolution']['report_end'],
                        f'{len(years)}个完整年度；最新累计披露截至{result["disclosure_resolution"]["report_end"]}')


def install_view(reader_view, root, digest, completed_at, report_end, coverage, provenance='autonomous-two-table-v1'):
    """Publish a validated view; historical migrations retain explicit provenance."""
    view = public_view(reader_view); code = view['code']
    if not re.fullmatch(r'[A-Za-z0-9._-]+', code): raise ValueError('COMPANY_CODE_INVALID')
    data = catalog(root)
    prior = next((e for e in data['companies'] if e['code'] == code), None)
    if prior and prior['completed_at'] > completed_at: raise ValueError('OLDER_DELIVERY')
    directory = root / 'research' / code
    version = directory / 'versions' / digest
    version.mkdir(parents=True, exist_ok=True)
    content = json.dumps(view, ensure_ascii=False, indent=2) + '\n'
    snapshot = version / 'report.json'
    if snapshot.exists() and snapshot.read_text() != content: raise ValueError('IMMUTABLE_VIEW_CONFLICT')
    snapshot.write_text(content)
    template = (root / 'assets/company-tables.html').read_text()
    template = template.replace('<title>资产表与经营表 | AH Note</title>', f'<title>{html.escape(view["name"])} · 资产表与经营表 | AH Note</title>')
    (version / 'index.html').write_text(template)
    (directory / 'index.html').write_text(template.replace('<body>', f'<body data-report="./versions/{digest}/report.json">'))
    entry = {'code': code, 'name': view['name'], 'report_end': report_end, 'completed_at': completed_at,
             'source_sha256': digest, 'view_sha256': hashlib.sha256(content.encode()).hexdigest(),
             'coverage': coverage, 'provenance': provenance,
             'version_url': f'research/{code}/versions/{digest}/'}
    data['companies'] = sorted([e for e in data['companies'] if e['code'] != code] + [entry], key=lambda e: e['code'])
    catalog_file = root / 'data/two-table/catalog.json'; catalog_file.parent.mkdir(parents=True, exist_ok=True)
    catalog_file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    refresh_index(root)
    return entry


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--site-root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--analysis-root', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(install(args.input, args.site_root, args.analysis_root), ensure_ascii=False))
