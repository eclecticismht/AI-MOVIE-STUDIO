const {test}=require('node:test'),assert=require('node:assert/strict');
const Revision=require('./shot-revision'),Redo=require('./timeline-redo'),Dialogue=require('./dialogue-contract');
const prompt='integrated_multimodal_description: [Shot 1] A man parks left over five seconds.\noverall_soundscape: Quiet traffic.\nnon_diegetic_music: N/A';
const shot={id:'s',script:'old action',dur:5,dialogue:'甲：旧台词',sourceExcerpt:'甲：旧台词',characterIds:['a'],assetStates:{a:{description:'old',imageUrl:'/assets/a.png'}}};
const request={shot,instruction:'台词改为走吧',characters:[{id:'a',name:'甲'}]};
const result=()=>({script:'向左停车',visual:'车停在左边',camera:'中景',scene:'街道',dialogue:'甲：走吧',dur:5,prompt,audioMode:'model',assetStates:{a:{description:'蓝色衣服'}},summary:'修改台词并靠左停车'});
test('AI revision can change dialogue with updated local source and keeps original in history',()=>{
 const r=Revision.parse(JSON.stringify(result()),request),next=Redo.revised(shot,{...r,instruction:request.instruction});
 assert.equal(next.dialogue,'甲：走吧');assert.equal(next.assetStates.a.imageUrl,'/assets/a.png');assert.equal(next.redoHistory[0].before.sourceExcerpt,'甲：旧台词');
 Dialogue.checkSource(Dialogue.parseDialogue(next.dialogue,request.characters),next.sourceExcerpt);assert.equal(shot.dialogue,'甲：旧台词');
});
test('complete silence clears speech and overrides prior audio asset',()=>{
 const r=Revision.parse(JSON.stringify({...result(),dialogue:'',audioMode:'mute'}),request),next=Redo.revised({...shot,audioAsset:'old'},r);
 assert.equal(next.dialogue,'');assert.equal(next.audioMode,'mute');assert.equal(next.audioAsset,undefined);
});
test('revision rejects invalid AI output before saving and preserves local references when states cleared',()=>{
 assert.throws(()=>Revision.parse(JSON.stringify({...result(),dur:100}),request),/时长/);
 assert.throws(()=>Revision.parse(JSON.stringify({...result(),dialogue:'乙：走吧'}),request),/角色库/);
 assert.throws(()=>Revision.parse(JSON.stringify({...result(),assetStates:{unrelated:{description:'x'}}}),request),/未选中/);
 const r=Revision.parse(JSON.stringify({...result(),assetStates:{}}),request);assert.equal(r.assetStates.a.imageUrl,'/assets/a.png');
});
test('revision endpoint uses selected model and saved provider key and returns structured edits',async()=>{
 const {Readable}=require('node:stream');let sent;
 const handler=require('./screenplay-api').createScreenplayApi({env:{},credentialStore:{get:async provider=>{assert.equal(provider,'deepseek');return 'test-credential'},status:()=>({})},fetchImpl:async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result())}}]})}}});
 const req=Readable.from([JSON.stringify({...request,model:'deepseek-flash'})]);Object.assign(req,{method:'POST',headers:{host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173'}});let status,body;
 await handler(req,{writeHead:s=>status=s,end:b=>body=JSON.parse(b)},'/api/screenplay/shot-revision');
 assert.equal(status,200);assert.equal(body.revision.dialogue,'甲：走吧');assert.equal(sent.response_format.type,'json_object');assert.match(sent.messages[0].content,/用户的新要求优先/);assert.equal(JSON.stringify(body).includes('test-credential'),false);
});
test('revision request omits media, prior history and unrelated project fields',()=>{
 const r=Redo.editRequest({...shot,redoHistory:[{secret:'old'}],videoUrl:'video',projectId:'p'},prompt,'向左',request.characters);
 assert.equal(r.shot.redoHistory,undefined);assert.equal(r.shot.videoUrl,undefined);assert.equal(r.instruction,'向左');
});
