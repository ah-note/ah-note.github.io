import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from two_table_reports import public_view, merge_feed, refresh_index
from research_feed import ResearchFeedEntry


class TwoTableTests(unittest.TestCase):
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
            self.assertEqual(feed[0].page_url, './PDD/')
            (root / 'data/research.json').write_text(json.dumps({'reports': [e.public_record() for e in [old, other]]}))
            refresh_index(root)
            first = (root / 'research/index.html').read_text()
            self.assertIn('资产表与经营表', first)
            self.assertIn('../reports/TEST/', first)
            self.assertEqual(article.read_text(), 'historical')
            refresh_index(root)
            self.assertEqual((root / 'research/index.html').read_text(), first)


if __name__ == '__main__': unittest.main()
