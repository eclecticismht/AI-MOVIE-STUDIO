(function(root){
 const visualNotes=typeof module!=='undefined'&&module.exports?require('./reference-visual-notes'):root.ReferenceVisualNotes;
 function isStructured(value){const s=String(value||'').trim();return /^integrated_multimodal_description:/i.test(s)&&/overall_soundscape:[\s\S]*non_diegetic_music:/i.test(s)&&s.indexOf('overall_soundscape:')>s.indexOf('integrated_multimodal_description:');}
 function compile(shot,project,refs){
  const duration=Number(shot.dur);if(!Number.isFinite(duration)||duration<4||duration>15)throw Error('请设置 4–15 秒的镜头时长');
  const assets=refs.map(r=>`${r.name} (${r.kind}): ${visualNotes(r)}`).join('\n');
  const constraints=`\n\nSelected visual assets for this shot only:\n${assets||'No visual asset specified.'}\nPreserve each selected identity and current wardrobe; do not import biographical clothing, other project assets or past actions. Silent screen content stays on the screen and is never spoken.\n${shot.continueFromShotId?'Continue from the supplied final frame of the preceding shot, preserving the camera, positions, wardrobe and objects. Perform only this shot’s new action. No speech or narration.':''}\n`;
  if(/^integrated_multimodal_description:/i.test((shot.prompt||'').trim())){const prompt=shot.prompt.trim(),boundary=prompt.indexOf('overall_soundscape:');return boundary<0?prompt+constraints:prompt.slice(0,boundary)+constraints+prompt.slice(boundary);}
  return `integrated_multimodal_description: [Shot 1] Live-action, ${project?.bible?.style||'cinematic realism'}. One continuous ${duration}-second shot.\nAction: ${shot.script||''}\nComposition: ${shot.visual||shot.desc||''}\nCamera: ${shot.camera||''}\n${shot.prompt||''}\nDo not invent additional actions or dialogue.${constraints}\noverall_soundscape: Natural location ambience with subtle sounds synchronized to the described action. Spoken words and speakers are bound separately from the verified dialogue field.\n\nnon_diegetic_music: N/A`;
 }
 const api={compile,visualNotes,isStructured};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ShotPrompt=api;
})(typeof globalThis!=='undefined'?globalThis:this);
