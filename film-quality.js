const {compareSpeech,transcribe}=require('./speech-audit');
const {alignSubtitles}=require('./subtitle-timing');
async function checkShot(shot,file,model,recognize=transcribe,resolveVoice=require('./audio-assets').resolveAudioAsset){
 if(['black','screen'].includes(shot.renderMode)||shot.audioMode==='mute'||shot.audioMode==='replacement')return {status:'not_applicable',reason:'成片音轨不采用模型声音。'};
 try{
  const expected=(shot.dialogueEvents||[]).filter(e=>e.type==='speech').map(e=>e.text).join('');
  const transcription=await recognize(shot.audioMode==='voiceover'?resolveVoice(shot.audioAsset):file,expected,model);
  const result=compareSpeech(shot.dialogueEvents,transcription);
  if(['text_match','pronunciation_match'].includes(result.status)&&expected)shot.subtitleTiming=alignSubtitles(shot.dialogueEvents,transcription,(17*Math.round((shot.duration*24-5)/17)+5)/24);
  return result;
 }catch(error){return {status:'check_failed',reason:error.message}}
}
const passed=result=>['text_match','pronunciation_match','not_applicable'].includes(result?.status)||result?.review?.accepted===true;
async function checkShotWithFallback(shot,file,model,fallbackModel,recognize=transcribe){
 const primary=await checkShot(shot,file,model,recognize);
 if(passed(primary)||!fallbackModel||model===fallbackModel||!shot.dialogueEvents?.some(e=>e.type==='speech'))return primary;
 const secondary=await checkShot(shot,file,fallbackModel,recognize);
 shot.speechCheckHistory=[...(shot.speechCheckHistory||[]),{at:new Date().toISOString(),result:primary}];
 // A missing/broken optional model must not erase the available transcription.
 if(secondary.status==='check_failed')return {...primary,crosscheckError:secondary.reason};
 return {...secondary,automaticCrosscheck:true};
}
function holdForReview(run,index,result){
 run.qualityHold={index:index+1,shotId:run.shots[index].shotId,result,history:run.shots[index].speechCheckHistory||[]};
 run.status='paused';run.error=`第 ${index+1} 镜声音检查未通过，素材已保留。请试听复核或修订重做后继续。`;
 run.current={index:index+1,shotId:run.shots[index].shotId,stage:'等待声音问题处理'};
}
function acceptReview(run,note){
 if(run.rechecking)throw Error('正在重新检查声音，请稍后');
 if(run.status!=='paused'||!run.qualityHold)throw Error('没有待确认的声音检查');
 if(typeof note!=='string'||note.trim().length<4||note.length>1000)throw Error('请填写试听核对结果');
 const shot=run.shots[run.qualityHold.index-1];
 if(!shot?.speechCheck||shot.speechCheck.status!=='needs_review')throw Error('检查失败或缺少对白数据时不能手工确认，请先解决检查问题');
 shot.speechCheck.review={accepted:true,note:note.trim(),at:new Date().toISOString()};delete run.qualityHold;run.error=null;
}
async function recheckHeldShot(run,file,recognize=transcribe){
 if(run.rechecking)throw Error('正在重新检查声音，请稍后');
 if(run.status!=='paused'||!run.qualityHold)throw Error('没有待复核的镜头');
 const index=run.qualityHold.index-1,shot=run.shots[index];
 if(!shot?.ready)throw Error('该镜头尚未生成');
 run.rechecking=true;
 try{
  const previous=shot.speechCheck;
  const result=await checkShot(shot,file,'medium',recognize);
  shot.speechCheckHistory=[...(shot.speechCheckHistory||[]),{at:new Date().toISOString(),result:previous}];
  shot.speechCheck=result;
  if(passed(result)){delete run.qualityHold;run.error=null;run.current={index:index+1,shotId:shot.shotId,stage:'声音文字复核匹配；人物和口型仍需审片，可继续制作'};}
  else holdForReview(run,index,result);
  return result;
 }finally{delete run.rechecking;}
}
module.exports={checkShot,checkShotWithFallback,passed,holdForReview,acceptReview,recheckHeldShot};
