const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Pending=require('./film-pending-quality'),Prompt=require('./shot-prompt'),D=require('./dialogue-contract');
test('rechecking a partially rendered run does not claim all shots are generated',()=>{
 const run={qualityGate:true,status:'paused',shots:Array.from({length:73},(_,i)=>({shotId:'s'+i,ready:i<2,...(i<2?{speechCheck:{status:'needs_review'}}:{})}))};
 assert.equal(Pending.holdBeforeAssembly(run),true);assert.match(run.error,/已生成 2\/73 镜/);assert.match(run.error,/其余 71 镜尚未生成/);assert.doesNotMatch(run.error,/全部镜头素材已生成/);assert.equal(run.status,'paused');
});
test('the same gate reports completion only after every shot is ready and still blocks bad audio',()=>{
 const run={qualityGate:true,status:'paused',shots:[{shotId:'a',ready:true,speechCheck:{status:'needs_review'}}]};
 assert.equal(Pending.holdBeforeAssembly(run),true);assert.match(run.error,/全部镜头素材已生成/);assert.equal(run.shots[0].speechCheck.status,'needs_review');
});
test('silent production metadata is distinct from approved Chinese words without removing visual directions',()=>{
 const p=Prompt.compile({dur:5,prompt:'integrated_multimodal_description: The boy sits on the sled.\noverall_soundscape: Snowy footsteps.\nnon_diegetic_music: N/A'},{},[{assetId:'child',kind:'characters',name:'Young Ximen Qing',notes:'State for this shot only: Grey padded coat; hands grip the wooden sides.'}]);
 assert.match(p,/SILENT production directions/);assert.match(p,/hands grip the wooden sides/);
 const final=D.bindDialogue(p,[{type:'speech',speakerId:'child',speakerName:'小西门清',delivery:'onscreen',text:'爸，两口了。'}],5,[{assetId:'child'}]);assert.match(final,/<d>\[Chinese\]爸，两口了。<\/d>/);assert.match(final,/sole visible speaking character/);
});
test('automatic storyboard asset states are authored in English while dialogue and source text remain Chinese',()=>{
 const api=fs.readFileSync('screenplay-api.js','utf8');assert.match(api,/description 仅用英文/);assert.match(api,/中文故事、人物名、台词和 screenText 均保留原文/);
});