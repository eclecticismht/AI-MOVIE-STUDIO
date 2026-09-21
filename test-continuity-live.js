// Four bounded QA shots using the production upload, Ref2VA and film pipeline.
const fs=require('node:fs');
const {referencePrompt}=require('./reference-assets');
async function post(url,body){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),out=await r.json();if(!r.ok)throw Error(out.error);return out}
(async()=>{
 const specs=[
 ['chen-school','characters','陈实','High-school flashback: teenage Chen Shi in the blue and white school uniform shown in this image.'],
 ['sun-school','characters','孙嘉俊','High-school flashback: teenage Sun Jiajun in the blue and white school uniform shown in this image.'],
 ['classroom','scenes','高二教室','High-school classroom with wooden desks and school windows.'],
 ['chen','characters','陈实','Adult Chen Shi, faded gray blue work shirt, exhausted after construction work.'],
 ['bus-night','scenes','夜间公交车内','Night bus interior, blue seats, metal handrails, city lights outside windows.'],
 ['village-night','scenes','城中村街巷','Guangzhou urban village alley at night, close buildings and household lights.'],
 ['stairwell-night','scenes','城中村楼道','Narrow concrete residential stairwell at night, metal handrails, dim warm light.']
 ];const assets={};
 for(const [id,kind,name,notes] of specs){const dataUrl='data:image/png;base64,'+fs.readFileSync('assets/laoshiren-v2/'+id+'.png').toString('base64');const {file}=await post('http://127.0.0.1:8080/references',{dataUrl});assets[id]={assetId:id,kind,name,notes,file}}
 const scenes=[
 ['school',['chen-school','sun-school','classroom'],'In a high-school classroom in daylight, Chen Shi stands on the left and Sun Jiajun on the right, both in their blue-and-white school uniforms. In a fixed medium two-shot over four seconds, Chen Shi lowers his eyes while Sun Jiajun looks at him with an indifferent expression. Exactly these two students are visible. Both keep their mouths closed. No workwear, no construction site.','Quiet classroom room tone, no voices.'],
 ['bus',['chen','bus-night'],'Inside the referenced night bus, adult Chen Shi sits by the window, wearing his faded gray blue work shirt. A fixed medium shot holds for four seconds as he looks out at passing city lights, tired and silent. Blue seats and bus handrails remain visible. The entire shot stays inside the moving bus.','Soft bus engine and road rumble, no announcement or voices.'],
 ['village',['chen','village-night'],'At night in the referenced narrow Guangzhou urban village alley, adult Chen Shi in his faded gray blue work shirt walks slowly away from the camera for four seconds. Medium rear three-quarter tracking shot, household lights between close buildings. Stay outdoors in this single alley.','Quiet footsteps and distant city traffic, no voices.'],
 ['stairs',['chen','stairwell-night'],'Inside the referenced dim concrete residential stairwell at night, adult Chen Shi in his faded gray blue work shirt slowly climbs three steps away from the camera over four seconds. Medium rear three-quarter view from the lower landing, stable camera. Concrete steps and metal handrails remain clearly visible. Stay inside this single stairwell.','Footsteps on concrete with subtle indoor reverberation, no voices.']
 ];
 const shots=scenes.map(([id,ids,visual,sound])=>{const references=ids.map(id=>assets[id]);return {shotId:'qa-continuity-'+id,duration:4,width:864,height:480,dialogueEvents:[],references,prompt:referencePrompt('integrated_multimodal_description: [Shot 1] '+visual+'\n\noverall_soundscape: '+sound+'\n\nnon_diegetic_music: N/A',references)}});
 const result=await post('http://127.0.0.1:4173/api/film',{projectId:'AMS-QA-CONTINUITY',title:'资产连续性回归 · 校服／公交／街巷／楼道',shots});
 fs.writeFileSync('test-artifacts/continuity-live.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1});
