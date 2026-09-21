// Bounded integration test: three short shots, isolated from the user's full film.
const fs=require('node:fs');
async function main(){
  const specs=[['chen','characters','陈实','chen.png','Young construction worker, faded gray blue work shirt.'],['shade','scenes','塔吊底下阴凉处','shade.png','Shaded foot of a tower crane at a Guangzhou construction site.'],['phone','props','陈实的手机','phone.png','Old black smartphone, taped cracked lower-right screen.']];
  const refs=[];for(const [assetId,kind,name,file,notes] of specs){const dataUrl='data:image/png;base64,'+fs.readFileSync('assets/laoshiren-v2/'+file).toString('base64');const r=await fetch('http://127.0.0.1:8080/references',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataUrl})});const out=await r.json();if(!r.ok)throw Error(out.error);refs.push({assetId,kind,name,notes,file:out.file})}
  const prompt=visual=>`integrated_multimodal_description: [Shot 1] ${visual}\n\noverall_soundscape: Quiet distant construction ambience, no background voices.\n\nnon_diegetic_music: N/A`;
  const shots=[
    {shotId:'qa-onscreen',duration:4,prompt:prompt('Static medium close-up of Chen Shi seated alone in the shaded crane base, looking toward an unseen coworker. Natural restrained expression, one short answer then closes his mouth. The phone is not visible.'),references:refs.slice(0,2),dialogueEvents:[{type:'speech',speakerId:'chen',speakerName:'陈实',delivery:'onscreen',text:'快了。'}]},
    {shotId:'qa-phone',duration:4,prompt:prompt('Static medium shot of Chen Shi alone seated in the shaded crane base holding his old black phone at chest level. He listens silently, lips firmly closed the entire shot. The caller Sun is physically absent and never appears. The only voice is tinny sound from the phone speaker.'),references:refs,dialogueEvents:[{type:'speech',speakerId:'sun',speakerName:'孙嘉俊',delivery:'phone',text:'我不是不还你啊。'}]},
    {shotId:'qa-silent-message',duration:4,prompt:prompt('Static medium close-up of Chen Shi seated alone in the crane shade, reading a silent text message on his old phone. Restrained tired face, closed lips. No speaking and no voice from the phone. No gestures except a slight pause of his hand.'),references:refs,dialogueEvents:[{type:'screen',text:'再转五百呗'},{type:'screen',text:'我在买单'}]}
  ].map(s=>({...s,width:864,height:480}));
  const r=await fetch('http://127.0.0.1:4173/api/film',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:'AMS-QA-PIPELINE',title:'对白管线回归 · 现场／电话／静默',shots})});const data=await r.json();if(!r.ok)throw Error(data.error);fs.writeFileSync('test-artifacts/production-samples-run.json',JSON.stringify(data,null,2));console.log(JSON.stringify(data));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
