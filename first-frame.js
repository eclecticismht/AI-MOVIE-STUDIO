function validateFirstFrame(frame){
 if(frame===undefined||frame===null)return undefined;
 if(!frame||typeof frame!=='object'||!/^ams-ref-[a-f0-9]{64}\.(png|jpg|webp)$/.test(frame.file||''))throw Error('首帧图片无效，请重新上传');
 if(frame.speakerPosition!==undefined&&!['left','center','right'].includes(frame.speakerPosition))throw Error('首帧发声者位置无效');
 return {file:frame.file,...(frame.speakerPosition?{speakerPosition:frame.speakerPosition}:{})};
}
function firstFramePrompt(prompt){
 const part=(name,next,fallback)=>{const start=prompt.indexOf(name+':');if(start<0)return fallback;const end=next?prompt.indexOf(next+':',start):-1;return prompt.slice(start+name.length+1,end<0?undefined:end).trim()};
 const detail=part('detailed_description','overall_soundscape',part('integrated_multimodal_description','overall_soundscape',prompt)).replace(/<Subject \d+>/g,'the corresponding subject in the first frame').replace(/<Picture \d+>/g,'<Picture 1>');
 return 'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n\nintegrated_multimodal_description: '+detail+'\nKeep the first frame’s facial identities, garment details and spatial arrangement consistent as the action develops.\n\noverall_soundscape: '+part('overall_soundscape','non_diegetic_music','Natural location ambience.')+'\n\nnon_diegetic_music: '+part('non_diegetic_music',null,'N/A');
}
module.exports={validateFirstFrame,firstFramePrompt};
