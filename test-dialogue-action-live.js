// Bounded local regression: one dialogue stage followed by one silent action stage.
const fs=require('node:fs'),path=require('node:path');
const {uploadReference}=require('./reference-assets');
const {split}=require('./dialogue-action-split');
const Dialogue=require('./dialogue-contract');
(async()=>{
 const frame=JSON.parse(fs.readFileSync('frame-runs/frame_a28ed9f7a69d166d.json'));
 const characters=frame.plan.references.filter(r=>r.kind==='characters').map(r=>({id:r.assetId,name:r.name}));
 const text='老陈，借我五十，买包烟，明天还你。';
 const source={id:'shop-source',projectId:'AMS-SEQUENCE-QA',dur:8,dialogue:'孙嘉俊：'+text,sourceExcerpt:'孙嘉俊：'+text,visual:'School shop, left boy in white sleeves, right boy in blue sleeves.'};
 const before='A fixed medium two-shot in the school shop. The boy on the right in blue sleeves speaks casually to the boy on the left in white sleeves. The left boy listens silently with his mouth closed. Both keep their hands lowered and still for the whole shot. No banknote is taken out, offered or exchanged. At the end the right boy closes his mouth. Preserve faces, clothing and the shop exactly.';
 const after='Continue from the exact supplied last frame of the preceding shot. Both boys remain silent with mouths closed. The boy on the LEFT in white sleeves takes one small banknote out of his own trouser pocket, then extends it toward the boy on the RIGHT in blue sleeves. The right boy receives the banknote. The transfer is from left to right only. Keep the same two people, sleeves, shop, fixed camera and lighting. End with the right boy holding the banknote.';
 const {children}=split(source,{before:{action:before,visual:source.visual,duration:8},after:{action:after,visual:source.visual,duration:4}},characters,['shop-speech','shop-action']);
 const firstFrame=await uploadReference('data:image/png;base64,'+fs.readFileSync(path.join(__dirname,frame.imageUrl)).toString('base64'),'http://127.0.0.1:8188');firstFrame.speakerPosition='right';
 const shots=children.map((s,i)=>({shotId:s.id,duration:s.dur,width:864,height:480,...(i?{continueFromShotId:children[0].id}:{firstFrame}),references:frame.plan.references,sourceExcerpt:s.sourceExcerpt,dialogueEvents:Dialogue.parseDialogue(s.dialogue,characters),subtitle:s.dialogue,prompt:`integrated_multimodal_description: [Shot 1] One continuous ${s.dur}-second shot. ${s.script}\n\noverall_soundscape: Quiet night shop ambience, ${i?'no speech or narration':'only the right boy speaks'}.\n\nnon_diegetic_music: N/A`}));
 const response=await fetch('http://127.0.0.1:4173/api/film',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:source.projectId,title:'先对白后行动 · 尾帧承接回归样片',shots})}),out=await response.json();if(!response.ok)throw Error(out.error);
 fs.writeFileSync('test-artifacts/dialogue-action-live.json',JSON.stringify(out,null,2));console.log(out.run.id);
})().catch(e=>{console.error(e.message);process.exitCode=1});
