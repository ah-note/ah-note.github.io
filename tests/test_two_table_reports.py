import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from two_table_reports import public_view, merge_feed, refresh_index, checked_business_assets, checked_reader_notes, checked_display_unit
from research_feed import ResearchFeedEntry


class TwoTableTests(unittest.TestCase):
    def test_reader_notes_reject_long_text_and_scientific_notation(self):
        for note in ('这是一个远超四十字的表格注释，混入了年份、来源、计算过程和多个不同口径，应该移到证据或表外说明中，不应占据单元格。',
                     '肉猪销量1.66e+03万头'):
            with self.subTest(note=note), self.assertRaisesRegex(ValueError, 'READER_NOTE_DISPLAY_INVALID'):
                checked_reader_notes({'asset_table': {'groups': [{'evidence': {'2025': {'reader_note': note}}}]}})
        checked_reader_notes({'reader_note': '肉猪销量1,660万头（不含仔猪）。'})
        with self.assertRaisesRegex(ValueError, 'SCIENTIFIC_DISPLAY_INVALID'):
            checked_reader_notes({'unit': 'USD / 1e+06'})

    def test_currency_unit_labels_are_canonical(self):
        for currency, unit in [('CNY', '亿元'), ('USD', '亿美元'), ('HKD', '亿港币')]:
            checked_display_unit(currency, unit)
        with self.assertRaisesRegex(ValueError, 'DISPLAY_UNIT_INVALID'):
            checked_display_unit('HKD', '亿港元')

    def test_old_publisher_preserves_new_tables_and_versions(self):
        import build_site
        from two_table_reports import install_view
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'assets').mkdir()
            (root / 'assets/company-tables.html').write_text('<body></body>')
            install_view({'code': 'NEW', 'name': '新公司'}, root, 'abc',
                         '2026-09-15T00:00:00+08:00', '2025-12-31', '年度')
            snapshot = root / 'research/NEW/versions/abc/report.json'
            original = snapshot.read_bytes()
            with patch.object(build_site, 'RESEARCH_DIR', root / 'research'):
                build_site.write_research_pages([], [])
            refresh_index(root)
            self.assertEqual(snapshot.read_bytes(), original)
            self.assertTrue((root / 'research/NEW/index.html').is_file())
            self.assertIn('data-period-view="interim"', (root / 'research/NEW/latest/index.html').read_text())
            self.assertIn('data-report="../versions/abc/report.json"', (root / 'research/NEW/latest/index.html').read_text())
            self.assertIn('/research/NEW/', (root / 'capital/index.html').read_text())

    def test_business_assets_must_reconcile_to_company_totals(self):
        result = {'companies': [{'code': 'TEST', 'asset_table': {'disclosure_summary': [
            {'id': 'total_assets', 'values': {'y2025': 90}},
            {'id': 'total_liabilities', 'values': {'y2025': 50}},
        ]}}], 'reader_view': {'unit': 'CNY 亿元', 'operating_table': {'modules': [
            {'businesses': [{'id': 'feed'}, {'id': 'hog'}]},
        ]}}, 'period_metadata': {'y2025': {'kind': 'annual'}}}
        data = {'code': 'TEST', 'unit': 'CNY 亿元', 'kind': 'gross_segments', 'note': '年报分部',
                'sources': {'y2025': {'url': 'https://example.com/report.pdf', 'locator': '分部信息'}},
                'segments': [
                    {'id': 'feed', 'label': '饲料', 'assets': {'y2025': 40}, 'liabilities': {'y2025': 20}},
                    {'id': 'hog', 'label': '猪产业', 'assets': {'y2025': 60}, 'liabilities': {'y2025': 35}},
                ], 'eliminations': {'assets': {'y2025': 10}, 'liabilities': {'y2025': 5}}}
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / 'segments.json'
            source.write_text(json.dumps(data))
            self.assertEqual(checked_business_assets(source, result), data)
            data['eliminations']['assets']['y2025'] = 9
            source.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, 'BUSINESS_ASSET_RECONCILIATION_FAILED'):
                checked_business_assets(source, result)

    def test_one_entry_per_company_prefers_tables_then_research_then_report(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'data/two-table').mkdir(parents=True)
            (root / 'data/two-table/catalog.json').write_text(json.dumps({'companies': [{
                'code': 'PDD', 'name': '拼多多', 'report_end': '2025-12-31',
                'completed_at': '2026-01-01', 'coverage': '五年'}]}))
            stocks = []
            for code in ('PDD', 'DEEP', 'PLAIN'):
                (root / 'reports' / code).mkdir(parents=True)
                (root / 'reports' / code / 'index.html').write_text('report')
                stocks.append({'code': code, 'name': code, 'period': '2026-06-30'})
            (root / 'data/stocks.json').write_text(json.dumps({'stocks': stocks}))
            feed = [ResearchFeedEntry('current_company_research', code, code, 'US', '2026-06-30', '2026-09-01',
                                     '深度研报', f'../reports/{code}/', f'reports/{code}/', code, '', 'v4', 'pass')
                    for code in ('PDD', 'DEEP')]
            selected = {e.code: e for e in merge_feed(feed, root)}
            self.assertEqual(len(selected), 3)
            self.assertEqual(selected['PDD'].source, 'company_two_table')
            self.assertEqual(selected['DEEP'].label, '深度研报')
            self.assertEqual(selected['PLAIN'].label, '报告')

    def test_navigation_has_only_one_company_reading_link(self):
        from navigation import nav
        for page in ('reports', 'research', 'capital', 'industries', 'index'):
            rendered = nav(page)
            self.assertEqual(rendered.count('href="/capital/"'), 1)
            self.assertNotIn('href="/reports/"', rendered)
            self.assertNotIn('href="/research/"', rendered)

    def test_public_projection_keeps_numbers_and_public_sources(self):
        raw = {'values': {'2025': 123}, 'source': {'path': '/root/run/file.pdf', 'url': 'https://example.com/report', 'local_file': '/root/file'}}
        view = public_view(raw)
        self.assertEqual(view['values'], raw['values'])
        self.assertEqual(view['source'], {'url': 'https://example.com/report'})
        self.assertIn('path', raw['source'])

    def test_new_company_replaces_feed_entry_preserving_old_article(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'data/two-table').mkdir(parents=True)
            (root / 'research/PDD/old').mkdir(parents=True)
            article = root / 'research/PDD/old/index.html'; article.write_text('historical')
            (root / 'data/two-table/catalog.json').write_text(json.dumps({'companies': [{
                'code': 'PDD', 'name': '拼多多', 'report_end': '2026-06-30',
                'completed_at': '2026-09-15T14:35:22+08:00', 'coverage': '五年与半年'}]}))
            old = ResearchFeedEntry('old', 'PDD', '拼多多', 'US', '2025-12-31', '2026-01-01',
                                   '历史', '../reports/PDD/', 'reports/PDD/', '旧报告', '', 'old', 'pass')
            other = ResearchFeedEntry('old', 'TEST', '测试', 'US', '2025-12-31', '2026-01-01',
                                     '历史', '../reports/TEST/', 'reports/TEST/', '旧报告', '', 'old', 'pass')
            feed = merge_feed([old, other], root)
            self.assertEqual(len(feed), 2)
            self.assertEqual(feed[0].page_url, '/research/PDD/')
            (root / 'data/research.json').write_text(json.dumps({'reports': [e.public_record() for e in [old, other]]}))
            refresh_index(root)
            first = (root / 'research/index.html').read_text()
            self.assertIn('双表', first)
            self.assertIn('<th>公司</th><th>代码</th><th>内容</th><th>报告截止日</th>', first)
            self.assertIn('class="report-list-page"', first)
            self.assertNotIn('class="research-entry"', first)
            self.assertNotIn('阅读全文', first)
            self.assertNotIn('五年与半年', first)
            self.assertIn('/reports/TEST/', first)
            self.assertEqual(first, (root / 'capital/index.html').read_text())
            self.assertEqual(article.read_text(), 'historical')
            refresh_index(root)
            self.assertEqual((root / 'research/index.html').read_text(), first)


if __name__ == '__main__': unittest.main()
