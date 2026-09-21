const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateReferences,referencePrompt,uploadReference}=require('./reference-assets');
const {validatePlan}=require('./film-api');
const ref={assetId:'chen',kind:'characters',name:'Chen Shi',file:'ams-ref-'+'a'.repeat(64)+'.png'};
test('visual prompt uses shot-specific wardrobe instead of biographical wardrobe',()=>{const r={...ref,notes:'成年工地工人戴手套\nState for this shot only: 高中少年穿校服'};const p=referencePrompt('校园门口',[r]);assert.ok(p.includes('高中少年穿校服'));assert.ok(!p.includes('成年工地工人戴手套'));assert.ok(r.notes.includes('成年'));});
test('character biography does not invent unreferenced worn props',()=>{const p=referencePrompt('公交上坐着',[{...ref,notes:'工地戴手套，妹妹读高三'}]);assert.ok(!p.includes('工地戴手套'));assert.ok(p.includes('supplied portrait'));});
test('film plan preserves reference snapshots for the renderer',()=>{
  const plan=validatePlan({projectId:'p',title:'t',shots:[{shotId:'s',prompt:'a shot',duration:9,width:864,height:480,references:[ref]}]});
  assert.equal(plan.shots[0].references[0].file,ref.file);
  assert.throws(()=>validateReferences(Array(10).fill(ref)),/9/);
  assert.throws(()=>validateReferences([ref,ref]),/无效/);
});
test('reference prompt retains exact dialogue and separates sound from visual content',()=>{
  const p=referencePrompt('integrated_multimodal_description: [Shot 1] Chen Shi says <d>[Chinese] 我不借。</d>\n\noverall_soundscape: Traffic.\n\nnon_diegetic_music: N/A',[ref]);
  assert.ok(p.startsWith('subject_definitions:'));assert.ok(p.includes('<Picture 1>'));
  assert.ok(p.includes('<d>[Chinese] 我不借。</d>'));assert.ok(p.endsWith('non_diegetic_music:\nN/A'));
});

test('identity rules survive repeated prompt wrapping without duplication or changing dialogue',()=>{
 const original='detailed_description: Two classmates stand still.\noverall_soundscape: Silence.\nnon_diegetic_music: N/A';
 const first=referencePrompt(original,[ref]),second=referencePrompt(first,[ref]);
 assert.equal((second.match(/Reference identity and wardrobe lock:/g)||[]).length,1);
 assert.match(second,/Do not invent badges/);assert.match(second,/Two classmates stand still/);
});
test('image upload validates bytes and uses content-addressed input files',async()=>{
  const data='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDUAAAAAASUVORK5CYII=';
  let filename;
  const result=await uploadReference(data,'http://localhost:8188',async(url,options)=>{assert.ok(url.endsWith('/upload/image'));filename=options.body.get('image').name;assert.equal(options.body.get('type'),'input');return {ok:true,json:async()=>({name:filename,subfolder:''})}});
  assert.match(result.file,/^ams-ref-[a-f0-9]{64}\.png$/);
  await assert.rejects(uploadReference('data:image/png;base64,'+Buffer.from('not a real image').toString('base64'),'unused'),/格式/);
  await assert.rejects(uploadReference('file:///secret','unused'),/导入/);
});
