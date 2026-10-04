const {test}=require('node:test'),assert=require('node:assert/strict'),F=require('./local-first-frame');
const base={projectId:'p',shotId:'s',prompt:'A different room viewpoint in morning snow.',references:[{assetId:'a',kind:'images',name:'room',file:'ams-ref-'+ 'a'.repeat(64)+'.png'}]};
test('default and pre-existing frame plans keep strong reference identity settings',()=>{
 const p=F.validatePlan(base);assert.equal(p.referenceStrength,4);assert.equal(p.referencePolicy,'strict');assert.equal(F.buildGraph(p,0,null,'x')['10'].inputs.ref_boost,4);
 delete p.referenceStrength;delete p.referencePolicy;assert.equal(F.buildGraph(p,0,null,'x')['10'].inputs.ref_boost,4);
});
test('explicit variant preserves bounded strength and shot priority through a saved plan',()=>{
 const p=JSON.parse(JSON.stringify(F.validatePlan({...base,referenceStrength:1,referencePolicy:'adapt'}))),g=F.buildGraph(p,0,null,'x');
 assert.equal(g['10'].inputs.ref_boost,1);assert.match(g['11'].inputs.prompt,/Shot specification takes priority/);assert.doesNotMatch(g['11'].inputs.prompt,/Preserve its subject identity, structure/);
});
test('unsafe and non-finite reference options fail before submission',()=>{
 for(const patch of [{referenceStrength:0},{referenceStrength:4.1},{referenceStrength:'bad'},{referenceStrength:Infinity},{referencePolicy:'unbounded'}])assert.throws(()=>F.validatePlan({...base,...patch}),/参考/);
});