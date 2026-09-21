// Bounded end-to-end QA: only the supplied completed local frame, one four-second silent shot.
const fs=require('fs'),path=require('path');
const {uploadReference}=require('./reference-assets');
(async()=>{
 const id=process.argv[2];if(!/^frame_[a-f0-9]{16}$/.test(id||''))throw Error('Expected local frame job ID');
 const frame=JSON.parse(fs.readFileSync(path.join('frame-runs',id+'.json')));if(frame.status!=='completed')throw Error('Frame unfinished');
 const imagePath=path.join(__dirname,frame.imageUrl),firstFrame=await uploadReference('data:image/png;base64,'+fs.readFileSync(imagePath).toString('base64'),'http://127.0.0.1:8188');
 const shot={shotId:'local-frame-bus-qa',duration:4,width:864,height:480,firstFrame,references:frame.plan.references,dialogueEvents:[],sourceExcerpt:'陈实坐在夜间公交靠窗位置，疲惫地望着窗外。',subtitle:'',prompt:'integrated_multimodal_description: [Shot 1] Over four seconds, maintain the supplied medium shot of the exhausted man sitting beside the night bus window. He slowly turns his gaze toward the passing streetlights and breathes quietly, lips closed throughout. Preserve the exact face, gray-blue short-sleeved shirt, bare hands and seat arrangement of the first frame. A slight bus vibration moves the scene naturally. One continuous shot without cuts.\n\noverall_soundscape: Low bus engine hum and soft road noise. No speech, no radio, no public announcements, no singing.\n\nnon_diegetic_music: N/A'};
 const response=await fetch('http://127.0.0.1:4173/api/film',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:'AMS-LOCAL-FRAME-QA',title:'本地资产到首帧到视频回归',shots:[shot]})}),out=await response.json();if(!response.ok)throw Error(out.error);fs.writeFileSync('test-artifacts/local-frame-video.json',JSON.stringify({frameId:id,...out},null,2));console.log(out.run.id);
})().catch(e=>{console.error(e.message);process.exitCode=1});
