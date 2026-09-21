const fs=require('node:fs');
const {referencePrompt}=require('./reference-assets');
const {eventText}=require('./dialogue-contract');
(async()=>{
 const id='film_31432432082bf266',parent=JSON.parse(fs.readFileSync('film-runs/'+id+'/run.json','utf8')),shot=parent.shots[0];
 const prompt=referencePrompt(shot.prompt.replace('Natural restrained expression, one short answer then closes his mouth.','Over four seconds, he keeps his eyes lowered, gives one short restrained answer without smiling, then closes his mouth and stays still.'),shot.references);
 const response=await fetch('http://127.0.0.1:4173/api/film/'+id+'/retry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({index:0,revision:{prompt,duration:4,subtitle:shot.dialogueEvents.map(eventText).join('\n')}})});
 const out=await response.json();if(!response.ok)throw Error(out.error);fs.writeFileSync('test-artifacts/revision-live.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));
})().catch(e=>{console.error(e.message);process.exitCode=1});
