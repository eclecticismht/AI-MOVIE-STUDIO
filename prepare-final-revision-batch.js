const fs=require('node:fs');
const {uploadReference}=require('./reference-assets');
const {batchRetryPlan}=require('./film-api');
async function main(){
 const run=require('./film-runs/film_e17331fb07f8f361/run.json');
 const frames=require('./test-artifacts/approved-repair-frames.json');
 frames[34]='assets/generated-frames/frame_1a51678203f61c54_0.png';
 frames[82]='assets/generated-frames/frame_ebc16f492e5c8007_3.png';
 const entry=JSON.parse(fs.readFileSync('test-artifacts/entry-frame-approved.json','utf8'));frames[84]=entry.path;
 const overrides={
  6:'Chen Shi on the LEFT continues stacking bricks beside the woven sack. Older Lao Zhang on the RIGHT glances down at the sack and leans slightly toward Chen. Both are already crouched in the shade.',
  7:'Older Lao Zhang on the RIGHT looks at Chen Shi on the LEFT and asks his question. Chen keeps stacking bricks and listens silently.',
  8:'Chen Shi on the LEFT keeps his eyes lowered and gives a short reply. Lao Zhang on the RIGHT listens without speaking.',
  9:'Older Lao Zhang on the RIGHT raises his eyebrows slightly and asks how many bricks remain. Chen Shi on the LEFT listens silently.',
  10:'Chen Shi on the LEFT looks up at Lao Zhang and gives his brief answer. Lao Zhang on the RIGHT listens silently.',
  11:'Older Lao Zhang on the RIGHT smiles and speaks lightly to Chen Shi on the LEFT. Chen listens, still crouched beside the bricks.',
  12:'Chen Shi on the LEFT smiles briefly, then lowers his eyes and resumes stacking the red bricks. Lao Zhang on the RIGHT remains beside him. Neither speaks.',
  26:'In the classroom, teenage Chen Shi on the LEFT extends his empty palm toward teenage Sun Jiajun on the RIGHT, silently asking for his money back. Both keep their mouths closed. Preserve the distinct uniforms, white sleeves on Chen and blue sleeves on Sun.',
  28:'In the same classroom, teenage Chen Shi on the LEFT slowly withdraws his empty hand, disappointed. Teenage Sun Jiajun on the RIGHT looks casually away. No money changes hands and neither speaks. Preserve each boy\'s own uniform.',
  34:'Tight head-and-shoulders close-up of Chen Shi in the same plain gray short-sleeved shirt, looking downward toward his lunch outside the frame. He pauses, exhausted, without eating. Keep the lunchbox and hands below the frame. No added objects.',
  43:'Teenage Sun Jiajun on the RIGHT opens his empty hands, showing that he has no money. Teenage Chen Shi on the LEFT watches in silence. Both stay in the same classroom and their own distinct school uniforms.',
  45:'Teenage Chen Shi on the LEFT takes folded money from his pocket and extends it toward a class-fee collector\'s hand entering at the left edge of frame. Teenage Sun Jiajun on the RIGHT watches silently. Keep their exact separate school uniforms.',
  63:'Older Lao Zhang on the RIGHT turns to Chen Shi on the LEFT and asks about his unhappy face. Chen listens silently, tired, beside the brick stack.',
  64:'Chen Shi on the LEFT gives a brief restrained reply. Older Lao Zhang on the RIGHT listens silently. Both remain by the bricks.',
  65:'Older Lao Zhang on the RIGHT asks Chen Shi on the LEFT about heatstroke and suggests the medicine. His hands hold no medicine and he does not hand anything over. Chen listens silently.',
  66:'Chen Shi on the LEFT replies, looking tired. Older Lao Zhang on the RIGHT listens silently. Keep both crouched beside the bricks.',
  68:'Older Lao Zhang on the RIGHT leans slightly toward Chen Shi on the LEFT and gives his warning. His mouth is unobstructed while speaking; Chen listens silently.',
  70:'Older Lao Zhang on the RIGHT tells Chen Shi on the LEFT about the money he lent his nephew. He speaks steadily with a weary expression, mouth unobstructed. Chen listens silently. Keep both in place.',
  71:'Chen Shi on the LEFT gives one low brief response, then lowers his gaze to the bricks. Lao Zhang on the RIGHT is silent.',
  72:'Older Lao Zhang on the RIGHT speaks earnestly to Chen Shi on the LEFT. He stays still with his mouth unobstructed, delivering the whole supplied line clearly. Chen listens in silence. No cigarette action while talking.',
  74:'Chen Shi on the LEFT turns slightly toward Lao Zhang on the RIGHT and nods as he gives his brief reply. Lao Zhang listens silently.',
  82:'Seen from behind on the dim night stairwell, Chen Shi bends slightly, takes the gathered top of the woven sack at his LEFT with his left hand, then climbs two steps, right hand touching the railing. He wears the exact plain short-sleeved gray shirt. No change of location.',
  84:'Exactly one Chen Shi, already standing inside the doorway, lowers the soft woven sack onto the floor beside the door, releases it, then turns and sits in the empty wooden chair. The chair leg stays supported by the magazine. Night outside. No other person, no laptop, no extra furniture.',
  85:'Chen Shi sits at the table on the RIGHT in his plain gray short-sleeved shirt. He already holds his phone in his hand; he slowly lifts it and wakes its screen, staring at it. The modest room remains dim, the window dark outside. No added person or objects.',
  88:'Chen Shi sits on the RIGHT and silently stares at the phone in his hands. He remains still as the camera slowly shifts its focus toward the dim night window. Keep the exact plain gray short-sleeved shirt and room furniture.',
  91:'Chen Shi sits on the RIGHT, gazing down at the phone in his hands. His thumb slowly rubs its edge as he waits. A slow gentle push toward his restrained, tired expression. Preserve the dark night outside and his plain shirt.',
  96:'Chen Shi on the RIGHT turns the phone over and lowers it onto the wooden tabletop to his LEFT. Its opaque rear case and rear camera face UP, its display touches the table and is never visible after placement. He releases it, puts both hands on his knees and sits upright. Keep the phone on the table and the old magazine under the chair leg. No extra motion or speech.'
 };
 const cache=new Map(),revisions=[];
 for(const index of [...new Set([3,59,...Object.keys(frames).map(Number)])].sort((a,b)=>a-b)){
  const s=run.shots[index-1],speech=s.dialogueEvents.find(e=>e.type==='speech');
  const rev={prompt:s.prompt,subtitle:s.subtitle,duration:s.duration};
  if(frames[index]){
   if(!cache.has(frames[index]))cache.set(frames[index],await uploadReference('data:image/png;base64,'+fs.readFileSync(frames[index]).toString('base64'),'http://127.0.0.1:8188'));
   rev.firstFrame={...cache.get(frames[index]),...(speech?.delivery==='onscreen'?{speakerPosition:speech.speakerName==='老张'?'right':'left'}:{})};
  }
  if(overrides[index])rev.prompt=`integrated_multimodal_description: [Shot 1] One continuous ${s.duration}-second live-action shot, starting from the supplied frame. ${overrides[index]} Preserve faces, clothes and spatial arrangement from the first frame. No cuts.\n\noverall_soundscape: Quiet natural location ambience. ${speech?'Only the specified speaker delivers the separately bound exact Mandarin dialogue, clearly and naturally. No other voice.':'No spoken words, singing, narration or radio.'}\n\nnon_diegetic_music: N/A`;
  if(index===3)rev.prompt='integrated_multimodal_description: [Shot 1] A single 6-second shot. Liu, the yellow-helmeted man on the LEFT in the supplied frame, holds his water bottle and looks toward the workers to the right. He calls out the two supplied sentences in clear Mandarin, distinctly articulating each word. Keep the beige short-sleeved polo, face and bottle unchanged. Fixed camera.\n\noverall_soundscape: Liu\'s clear close male voice, faint distant construction. 工期 means the construction deadline: gōng qī. Say the two phrases with a natural pause, finishing by 5 seconds. No other voice.\n\nnon_diegetic_music: N/A';
  if([9,65,70,72].includes(index))rev.prompt=rev.prompt.replace('No other voice.','No other voice. '+({9:'快了 uses the neutral-tone particle le, meaning almost finished.',65:'藿香 is huò xiāng, the name of the medicine.',70:'外甥 is wài shēng, nephew, with first-tone shēng.',72:'Clearly articulate 话多 huà duō and 跟你 gēn nǐ.'})[index]);
  if(index===59)Object.assign(rev,{renderMode:'screen',screenAssetId:s.references.find(r=>r.name==='微信朋友圈界面').assetId,screenSource:'image',screenImagePercent:52,screenCards:[],firstFrame:null});
  if(!speech&&s.audioMode!=='replacement'){
   const donor=([26,28].includes(index)?43:[82].includes(index)?81:[84,85,88,91,96].includes(index)?97:31);
   Object.assign(rev,{audioMode:'replacement',audioAsset:run.shots[donor-1].audioAsset});
  }
  revisions.push({index:index-1,revision:rev});
 }
 const plan=batchRetryPlan(run,revisions);
 fs.writeFileSync('test-artifacts/final-revision-batch.json',JSON.stringify({revisions},null,2));
 fs.writeFileSync('test-artifacts/approved-repair-frames.json',JSON.stringify(frames,null,2));
 console.log(JSON.stringify({count:revisions.length,affected:plan.retriedShots}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
