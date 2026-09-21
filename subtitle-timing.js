const {normalize,compareSpeech}=require('./speech-audit');
function alignSubtitles(events,transcription,duration){
  const review=compareSpeech(events,transcription);
  if(!['text_match','pronunciation_match'].includes(review.status))return {status:'needs_review',reason:review.reason,cues:[]};
  const original=(events||[]).filter(e=>e.type==='speech').map(e=>e.text).join('');
  if(!original)return {status:'silent',cues:[]};
  if(transcription.timingSource==='whole-clip')return {status:'needs_review',reason:'识别原句一致，但缺少可靠分词时间，保留估算字幕。',cues:[]};
  const chars=Array.from(original),positions=chars.map((c,i)=>normalize(c)?i:-1).filter(i=>i>=0);
  const segments=transcription.segments.filter(s=>normalize(s.normalizedText??s.text));
  const lengths=segments.map(s=>Array.from(normalize(s.normalizedText??s.text)).length);
  if(lengths.reduce((a,b)=>a+b,0)!==positions.length)return {status:'needs_review',reason:'识别字数无法可靠映射到原句，未自动对齐。',cues:[]};
  let consumed=0,offset=0,previousEnd=0;const cues=[];
  for(let i=0;i<segments.length;i++){
    const s=segments[i];if(!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.start<previousEnd||s.end<=s.start||s.start>=duration)return {status:'needs_review',reason:'识别时间轴异常，未自动对齐。',cues:[]};
    consumed+=lengths[i];const end=consumed>=positions.length?chars.length:positions[consumed];
    cues.push({start:s.start,end:Math.min(s.end,duration),text:chars.slice(offset,end).join('')});offset=end;previousEnd=s.end;
  }
  return {status:'aligned',cues};
}
function checkedSubtitleTiming(shot){
 const check=shot.speechCheck,expected=(shot.dialogueEvents||[]).filter(e=>e.type==='speech').map(e=>e.text).join('');
 if(!expected||check?.expected!==expected||!['text_match','pronunciation_match'].includes(check.status)||!check.transcription)return null;
 const timing=alignSubtitles(shot.dialogueEvents,check.transcription,(17*Math.round((shot.duration*24-5)/17)+5)/24);
 return timing.status==='aligned'?timing:null;
}
module.exports={alignSubtitles,checkedSubtitleTiming};
