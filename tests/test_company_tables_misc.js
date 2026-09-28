const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/two-table/catalog.json')));
const entry = catalog.companies.find((item) => item.code === '300498.SZ');
const report = JSON.parse(fs.readFileSync(path.join(root, 'research/300498.SZ/versions', entry.source_sha256, 'report.json')));
const script = fs.readFileSync(path.join(root, 'assets/company-tables.js'), 'utf8');

async function render(mode) {
  const content = {innerHTML: '', addEventListener(_name, listener) { this.click = listener; }};
  const header = {innerHTML: ''};
  const context = {
    document: {body: {dataset: {periodView: mode}}, querySelector(selector) {
      return selector === '#company-content' ? content : selector === '#page-header' ? header : {focus() {}};
    }},
    fetch: async () => ({ok: true, json: async () => report}),
    CSS: {escape: (value) => value.replaceAll('/', '\\/')},
    console,
  };
  vm.runInNewContext(script + '\n;globalThis.testApi = {miscObjects, assetMaterialityBases, fmt, readable, naturalUnit};', context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.doesNotMatch(content.innerHTML, /加载失败/);
  return {content, context};
}

function click(content, selector, data) {
  content.click({target: {closest(query) {
    return query === selector ? {dataset: data} : null;
  }}});
}

(async () => {
  const {content, context} = await render('annual');
  assert.doesNotMatch(context.testApi.fmt(1e22), /e[+-]?\d/i);
  assert.doesNotMatch(context.testApi.readable(1e22), /e[+-]?\d/i);
  assert.equal(context.testApi.naturalUnit('USD / 1e+06'), '百万美元');
  assert.equal(context.testApi.naturalUnit('USD 亿元'), '亿美元');
  const working = report.asset_table.groups.find((group) => group.id === 'operating').sections.find((section) => section.id === 'working');
  const periods = report.asset_table.periods;
  const base = context.testApi.assetMaterialityBases(report.asset_table, periods);
  const misc = context.testApi.miscObjects(working, 'operating', periods, base);
  assert.ok(misc.length >= 2);
  assert.ok(misc.some((item) => item.label === '销售票据'));
  for (const period of periods) {
    const parent = Math.max(Math.abs(working.values[period]),
      ...working.objects.map((item) => Math.abs(item.values[period])));
    const grouped = misc.reduce((sum, item) => sum + Math.abs(item.values[period]), 0);
    assert.ok(grouped <= parent * 0.1 + 1e-9, `${period}: ${grouped} > ${parent * 0.1}`);
  }
  const synthetic = (values, total) => ({values: {y2024: total, y2025: total}, objects: values.map(([id, value, force_display]) => ({
    id, values: {y2024: value, y2025: value}, movements: {}, force_display,
  }))});
  const years = ['y2024', 'y2025'];
  const safe = context.testApi.miscObjects(synthetic([['core', 92, true], ['a', 4], ['b', 4]], 100),
    'operating', years, {asset: 200, liability: 200});
  assert.deepEqual(Array.from(safe, (item) => item.id), ['a', 'b']);
  const offset = context.testApi.miscObjects(synthetic([['core', 92, true], ['a', 8], ['b', -8]], 92),
    'operating', years, {asset: 300, liability: 300});
  assert.equal(offset.length, 0, 'opposite signs cannot evade the ten percent cap');
  const nearZero = context.testApi.miscObjects(synthetic([
    ['asset', 100, true], ['obligation', -100, true], ['a', 4], ['b', -4],
  ], 0), 'operating', years, {asset: 200, liability: 200});
  assert.deepEqual(Array.from(nearZero, (item) => item.id), ['a', 'b'],
    'a near-zero net section uses its largest child as the floor');
  assert.equal(context.testApi.miscObjects(synthetic([['core', 92, true], ['a', null], ['b', 4]], 100),
    'operating', years, {asset: 200, liability: 200}).length, 0);
  assert.match(content.innerHTML, /经营周转资产与义务/);
  assert.match(content.innerHTML, /生产性固定资产/);
  assert.doesNotMatch(content.innerHTML, /<th class="item"[^>]*>销售票据<\/th>/);
  assert.doesNotMatch(content.innerHTML, /data-misc-key=/);

  const key = `${report.id}/operating/working`;
  click(content, '[data-section-key]', {sectionKey: key});
  assert.match(content.innerHTML, /data-misc-key=/);
  assert.ok(content.innerHTML.includes(`data-parent-section="${key}"`));
  assert.ok(content.innerHTML.indexOf('应付专业户款</th>') < content.innerHTML.indexOf(`data-parent-section="${key}"`));
  assert.match(content.innerHTML, /经营周转资产与义务下杂项/);
  assert.doesNotMatch(content.innerHTML, /<th class="item"[^>]*>销售票据<\/th>/);
  click(content, '[data-misc-key]', {miscKey: key});
  assert.match(content.innerHTML, /<th class="item"[^>]*>销售票据<\/th>/);
  assert.match(content.innerHTML, /class="object-row misc-member"/);
  const css = fs.readFileSync(path.join(root, 'assets/company-tables.css'), 'utf8');
  assert.match(css, /\.misc-total th,\.misc-total td\{[^}]*font-size:12px;font-weight:normal/);

  const interim = await render('interim');
  assert.match(interim.content.innerHTML, /经营周转资产与义务/);
  assert.doesNotMatch(interim.content.innerHTML, /data-misc-key=/);
  console.log('company table section and misc disclosure: ok');
})().catch((error) => { console.error(error); process.exitCode = 1; });
