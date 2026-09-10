const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../value-line/berun-assets');
const d=JSON.parse(fs.readFileSync(path.join(root,'data.json'),'utf8'));
const {render}=require(path.join(root,'app.js'));
const close=(a,b)=>assert.ok(Math.abs(a-b)<0.01,a+' != '+b);
test('each balance rolls forward in RMB',()=>{for(const g of d.groups)for(const r of g.rows){close(r.start+r.changes.reduce((s,c)=>s+c[1],0),r.end);}});
test('group balances and consolidated and parent equity reconcile',()=>{for(const g of d.groups){close(g.rows.reduce((s,r)=>s+r.start,0),d.totals[g.key][0]);close(g.rows.reduce((s,r)=>s+r.end,0),d.totals[g.key][1]);}for(const i of [0,1]){close(d.totals.op[i]+d.totals.na[i]-d.totals.nl[i],d.totals.net[i]);close(d.totals.net[i]-d.totals.minority[i],d.totals.parent[i]);}close(d.totals.net[1],16561766912.38);});
test('merged rows and uncertain changes remain explicit',()=>{const html=render(d);assert.match(html,/rowspan="/);assert.match(html,/待细拆/);assert.match(html,/归母净资产/);assert.doesNotMatch(html,/NaN|undefined/);const page=fs.readFileSync(path.join(root,'index.html'),'utf8');assert.match(page,/2024 年末/);assert.match(page,/2025 年末/);assert.match(page,/未扣必要经营现金/);assert.ok(fs.existsSync(path.join(root,'notes.html')));});
