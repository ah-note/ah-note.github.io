"""One public company-reading entry, with historical URLs kept reachable."""
import re


def nav(current='capital', prefix=''):
    active = current if current in {'index', 'industries', 'reference'} else 'capital'
    items = [('股票', 'index', '/'), ('资本表', 'capital', '/capital/'),
             ('行业', 'industries', '/industries/'), ('参考资料', 'reference', '/reference/')]
    links = []
    for label, key, url in items:
        selected = ' class="active"' if key == active else ''
        links.append(f'<a{selected} href="{url}">{label}</a>')
    return '<nav class="site-nav">' + ''.join(links) + '</nav>'


def refresh(root):
    pages = [root / 'index.html', root / 'assets/company-tables.html']
    for directory in ('reports', 'research', 'capital', 'industries', 'reference', 'value-line'):
        pages.extend((root / directory).rglob('*.html'))
    count = 0
    for page in pages:
        if not page.is_file(): continue
        group = page.relative_to(root).parts[0]
        current = 'index' if group == 'index.html' else group
        original = page.read_text()
        updated = re.sub(r'<nav\b[^>]*class=["\'][^"\']*\bsite-nav\b[^"\']*["\'][^>]*>.*?</nav>',
                         lambda m: nav(current), original, flags=re.S)
        if original != updated:
            page.write_text(updated); count += 1
    return count
