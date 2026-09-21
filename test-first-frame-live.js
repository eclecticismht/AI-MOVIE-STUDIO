const fs=require('node:fs');
async function post(url,body){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),out=await r.json();if(!r.ok)throw Error(out.error);return out}
(async()=>{
 const firstFrame=await post('http://127.0.0.1:8080/references',{dataUrl:'data:image/png;base64,'+fs.readFileSync('assets/laoshiren-v2/school-first-frame.png').toString('base64')});
 const prompt='integrated_multimodal_description: [Shot 1] A fixed medium two-shot in this classroom. Over four seconds the young man on the left lowers his eyes slightly, while the young man on the right looks at him with an indifferent expression. Keep both faces, hairstyles, plain blue-white jackets and zippers exactly as in the first frame. Both mouths remain closed. No added badges or lettering. No camera movement.\n\noverall_soundscape: Soft quiet classroom room tone only. No voice or narration.\n\nnon_diegetic_music: N/A';
 fs.writeFileSync('test-artifacts/first-frame-prompt.txt',prompt);
 const result=await post('http://127.0.0.1:4173/api/film',{projectId:'AMS-QA-FIRST-FRAME',title:'首帧造型保持 · 高中双人镜头',shots:[{shotId:'qa-school-first-frame',firstFrame,dialogueEvents:[],prompt,duration:4,width:864,height:480}]});
 fs.writeFileSync('test-artifacts/first-frame-live.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.message);process.exitCode=1});
