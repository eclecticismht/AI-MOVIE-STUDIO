const fs=require('node:fs');
(async()=>{
 const prior=JSON.parse(fs.readFileSync('film-runs/film_e7cc121dcdeec577/run.json','utf8')).shots[0];
 const actions=['Over six seconds, the left person turns his head toward the right person, briefly looks at him, then looks down again. The right person stays still.','Over six seconds, the right person turns his upper body toward the classroom board and then returns to face the left person. The left person stays still.'];
 const shots=actions.map((action,i)=>({...prior,shotId:'qa-motion-'+i,duration:6,prompt:'integrated_multimodal_description: [Shot 1] Fixed medium two-shot, preserving both people and the classroom exactly from the first frame. '+action+' Keep both mouths closed, the plain blue-white jackets unchanged, and hands in pockets.\n\noverall_soundscape: Quiet classroom ambience only. No speech or narration.\n\nnon_diegetic_music: N/A'}));
 const r=await fetch('http://127.0.0.1:4173/api/film',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:'AMS-QA-MOTION',title:'首帧转头与转身回归',shots})}),out=await r.json();if(!r.ok)throw Error(out.error);fs.writeFileSync('test-artifacts/motion-live.json',JSON.stringify(out,null,2));console.log(out.run.id);
})().catch(e=>{console.error(e.message);process.exitCode=1});
