// One bounded wardrobe-fidelity retry; preserve the other three generated clips.
const fs=require('node:fs');
const {referencePrompt}=require('./reference-assets');
(async()=>{
 const id='film_2bb3c72caafe3674',response=await fetch('http://127.0.0.1:4173/api/film/'+id),parent=(await response.json()).run;
 if(parent.status!=='complete')throw Error('Wait for the four-shot sample to complete.');
 const shot=parent.shots[0];
 const prompt=referencePrompt(shot.prompt.replace('Both keep their mouths closed.','Both keep their mouths closed. Their school jackets have the exact plain blue-and-white stripe layout, collars and zippers visible in their respective reference portraits. Their chests and sleeves have no school crest, badge, circular patch, emblem or lettering. Preserve each portrait\'s individual facial proportions and hairline.'),shot.references);
 const r=await fetch('http://127.0.0.1:4173/api/film/'+id+'/retry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({index:0,revision:{prompt,duration:4,subtitle:''}})});
 const out=await r.json();if(!r.ok)throw Error(out.error);
 fs.writeFileSync('test-artifacts/continuity-retry.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));
})().catch(e=>{console.error(e.message);process.exitCode=1});
