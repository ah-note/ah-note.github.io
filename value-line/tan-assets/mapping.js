const tanFields=typeof module!=='undefined'?require('../berun-assets/fields.js'):{assetSets,movementFields,movementGroups};
function standardize(d){
 const total=xs=>xs.reduce((a,b)=>a+b,0),equal=(a,b)=>Math.abs(a-b)<0.01;
 const seen=new Set();
 const groups=tanFields.assetSets.map(([key,title,items])=>({key,title,rows:items.map(([id,label])=>{
  const components=d.components.filter(c=>c.asset===id),aggregates=new Map();
  for(const c of components){
   if(seen.has(c.key))throw Error('Duplicate component');seen.add(c.key);
   if(!equal(c.start+total(c.events.map(e=>e.amount)),c.end))throw Error('Unclosed source '+c.key);
   for(const e of c.events){
    const field=tanFields.movementFields[e.code];if(!field)throw Error('Unknown field '+e.code);
    const [group,fieldLabel]=field;
    if(!aggregates.has(group))aggregates.set(group,{code:group,label:tanFields.movementGroups[group],amount:0,details:[]});
    const a=aggregates.get(group);a.amount+=e.amount;a.details.push({...e,fieldLabel});
   }
  }
  return {key:id,label,marker:components.some(c=>c.estimated)?'²':'',start:total(components.map(c=>c.start)),end:total(components.map(c=>c.end)),components,changes:[...aggregates.values()]};
 })}));
 if(seen.size!==d.components.length)throw Error('Unmapped component');
 for(const g of groups)for(const [i,k] of ['start','end'].entries())if(!equal(total(g.rows.map(r=>r[k])),d.totals[g.key][i]))throw Error('Group does not reconcile');
 for(const i of [0,1])if(!equal(d.totals.op[i]+d.totals.na[i]-d.totals.nl[i],d.totals.net[i])||!equal(d.totals.net[i]-d.totals.minority[i],d.totals.parent[i]))throw Error('Equity does not reconcile');
 return groups;
}
if(typeof module!=='undefined')module.exports={standardize};
