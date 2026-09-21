// Creates a reviewable revision batch; submission is separate from preparation.
const fs=require('fs');
const {batchRetryPlan}=require('./film-api');
const sourceId=process.argv[2]||'film_2b2cc5d8e21a4d0d';
const run=JSON.parse(fs.readFileSync(`film-runs/${sourceId}/run.json`,'utf8'));
const actions={
 31:'Chen Shi looks down and slowly taps his phone twice with one finger, pauses, then taps once more. The camera sees the opaque back of the physical phone, his hands and his tired face; its display faces him and remains unreadable.',
 40:'Chen Shi waits motionless, looking down at the physical phone in his hands. His restrained expression becomes tense. The camera sees the opaque phone back; the display faces him and remains unreadable.',
 46:'Close view of Chen Shi holding his physical phone with its opaque rear case toward the camera. He taps once on the display facing him, then holds it steady while listening. Keep his mouth outside the composition and the display unreadable. The phone stays a single solid object in his hands.'
};
const revisions=Object.entries(actions).map(([n,action])=>{
 const s=run.shots[Number(n)-1];
 return {index:Number(n)-1,revision:{prompt:`For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n\nintegrated_multimodal_description: [Shot 1] One continuous ${s.duration}-second live-action medium close-up, starting from the supplied frame. ${action} Preserve his plain gray short-sleeved shirt, face, phone and sunlit construction site from the first frame. Fixed camera. The whole frame is a photographed physical scene: no floating interfaces, virtual keyboards, text overlays, captions, holograms or inserts.\n\noverall_soundscape: Quiet construction-site ambience, faint distant machinery. No speech or music.\n\nnon_diegetic_music: N/A`,subtitle:s.subtitle,duration:s.duration,firstFrame:s.firstFrame,audioMode:s.audioMode,audioAsset:s.audioAsset}};
});
fs.writeFileSync('test-artifacts/phone-repair-batch.json',JSON.stringify({revisions},null,2));
const plan=['complete','paused','failed'].includes(run.status)?batchRetryPlan(run,revisions):null;
console.log(JSON.stringify({sourceId,redo:plan?.retriedShots,prepared:revisions.map(r=>r.index+1),validationDeferred:!plan}));
