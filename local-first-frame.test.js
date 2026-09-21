const test=require('node:test'),assert=require('node:assert/strict');
const {validatePlan,buildGraph,passReferences,executionSteps}=require('./local-first-frame');
const ref=(kind,id)=>({kind,assetId:id,name:id,file:'ams-ref-'+id.repeat(64).slice(0,64)+'.png'});
const input={projectId:'p',shotId:'s',prompt:'两个人坐在教室',references:[ref('scenes','a'),ref('characters','b'),ref('characters','c'),ref('props','d')]};
test('later prop pass replaces the placeholder without overwriting other subjects',()=>{
 const g=buildGraph(validatePlan(input),1,'ams-ref-'+ 'e'.repeat(64)+'.png','frame_prop');
 assert.match(g['11'].inputs.prompt,/Replace the corresponding placeholder object/);assert.match(g['11'].inputs.prompt,/wear, damage and attachments/);assert.match(g['11'].inputs.prompt,/Preserve every other person/);
});
test('all assets enter pixel and grounded text conditioning, no silent reference truncation',()=>{const p=validatePlan(input),seen=new Set();for(let i=0;i<executionSteps(p).length;i++){const refs=passReferences(p,i,'ams-ref-'+ 'e'.repeat(64)+'.png');const g=buildGraph(p,i,'ams-ref-'+ 'e'.repeat(64)+'.png','frame_123');Object.values(g).filter(n=>n.class_type==='LoadImage').forEach(n=>seen.add(n.inputs.image));const b=refs.length===3?'17':'7';assert.deepEqual(g['10'].inputs.source_image_b,[b,0]);assert.deepEqual(g['11'].inputs.image_b,[b,0]);assert.equal(g['7'].inputs.image,refs[1].file);assert.deepEqual(g['10'].inputs.target_latent,g['13'].inputs.latent_image);}for(const r of input.references)assert.ok(seen.has(r.file));assert.equal(executionSteps(p).length,2);});
test('two people share first pass, single reference does not invent second image',()=>{assert.deepEqual(validatePlan(input).references.slice(0,2).map(r=>r.kind),['characters','characters']);const g=buildGraph(validatePlan({...input,references:[input.references[0]]}),0,null,'frame_1');assert.equal(g['7'],undefined);assert.equal(g['11'].inputs.image_b,undefined);});
test('reject unsafe filenames, empty refs and oversized generation',()=>{for(const patch of [{references:[]},{references:[{...input.references[0],file:'../../secret'}]},{width:4096},{height:577},{prompt:''}])assert.throws(()=>validatePlan({...input,...patch}));});
test('current-shot visual state prevents historical wardrobe leaking into first frame',()=>{const p=validatePlan({...input,references:[{...ref('characters','b'),notes:'工地工人，戴手套。\nState for this shot only: 高中少年，校服。'}]});const prompt=buildGraph(p,0,null,'frame_test')['11'].inputs.prompt;assert.ok(prompt.includes('高中少年'));assert.ok(!prompt.includes('戴手套'));assert.ok(!prompt.includes('Image B:'));});
test('scene and both portraits share one pass; existing saved plans retain original pass order',()=>{const p=validatePlan(input),g=buildGraph(p,0,null,'frame_2');assert.equal(g['5'].inputs.image,input.references[0].file);assert.equal(g['16'].inputs.image,input.references[2].file);assert.equal(g['17'].class_type,'ImageStitch');delete p.compositionVersion;assert.equal(executionSteps(p).length,3);assert.equal(buildGraph(p,1,'ams-ref-'+ 'e'.repeat(64)+'.png','frame_2')['5'].inputs.image,input.references[0].file);});
test('phone orientation instructions do not leak into unrelated asset frames',()=>{
 const base=validatePlan({...input,prompt:'A man holds a water bottle.'});
 assert.ok(!buildGraph(base,0,null,'water')['11'].inputs.prompt.includes('face-down phone'));
 const phone=validatePlan({...input,prompt:'A face-down phone rests on the table.'});
 assert.match(buildGraph(phone,0,null,'phone')['11'].inputs.prompt,/opaque back and rear camera/);
});
