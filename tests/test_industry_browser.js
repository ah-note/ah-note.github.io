const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

async function main() {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, {innerHTML:'', textContent:'', value:'', events:{}, addEventListener(k,f){this.events[k]=f;}});
    return elements.get(id);
  };
  const issuer = (id, status, review, primary, browse) => ({id,name:id,markets:['US'],
    securities:[{code:id,name:id}],search_terms:[id],status,review_status:review,
    primary_leaf_id:primary,browse_eligible:browse,material_exposure_leaf_ids:[],candidate_leaf_ids:review==='pending'?['a']:[]});
  const data = {classification_status:'draft',taxonomy_effective_date:'2026-09-10',
    summary:{issuer_count:3,eligible_issuer_count:1,excluded_issuer_count:1},
    display_nodes:[{key:'sector:s',type:'sector',id:'s',name:'测试行业',parent_key:'root'},
      {key:'leaf:a',type:'leaf',id:'a',name:'食品分销',parent_key:'sector:s'},
      {key:'leaf:b',type:'leaf',id:'b',name:'其他经营',parent_key:'sector:s'}],
    leaves:[{leaf_id:'a',name_zh:'食品分销'},{leaf_id:'b',name_zh:'其他经营'}],leaf_display_keys:{a:'leaf:a',b:'leaf:b'},
    issuers:[issuer('PENDING','review_required','pending',null,false),
             issuer('DONE','eligible','complete','a',true),
             issuer('SHELL','no_analysis_value.shell','excluded',null,false)]};
  data.issuers[1].material_exposure_leaf_ids=['b'];
  const location={hash:''}, events={};
  const context={document:{getElementById:get},location,URLSearchParams,setTimeout,clearTimeout,
    window:{addEventListener:(k,f)=>events[k]=f,scrollTo:()=>{}},
    fetch:async()=>({ok:true,json:async()=>data})};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/industries.js'),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(get('catalogMeta').textContent,/校准中/);
  const route = hash => { location.hash=hash; events.hashchange(); return get('industryApp').innerHTML; };
  assert.match(route('#company=PENDING'),/尚未核准/);
  assert.match(get('industryApp').innerHTML,/候选类别（待核）/);
  assert.match(route('#company=DONE'),/当前没有其他已归类公司/);
  assert.doesNotMatch(route('#category=excluded'),/PENDING/);
  assert.match(get('industryApp').innerHTML,/SHELL/);
  assert.doesNotMatch(route('#category=leaf%3Aa'),/PENDING/);
  assert.match(get('industryApp').innerHTML,/DONE/);
  assert.match(route('#category=sector%3As'),/股票列表<\/h2><span>1 家（跨类重复展示）/);
  get('industrySearch').value='PENDING';
  get('industrySearchButton').events.click();
  assert.match(get('searchResults').innerHTML,/分类待核准/);
  assert.doesNotMatch(get('searchResults').innerHTML,/无分析价值/);
  console.log('industry browser state checks passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
