const crypto=require('node:crypto'),Quality=require('./film-quality');
function evaluate(selections){
 const warnings=[],checks=selections.map(({slot,source},i)=>{
  const shot=source.shot,speech=Quality.passed(shot.speechCheck)?'checked':shot.speechCheck?.status||'pending';
  const subtitles=shot.subtitleTiming?.status||(shot.dialogueEvents?.some(e=>e.type==='speech')?'pending':'not_applicable');
  if(speech!=='checked')warnings.push({index:i+1,shotId:slot.shotId,kind:'speech',message:shot.speechCheck?.reason||'声音尚未核对，请试听确认'});
  if(!['aligned','not_applicable'].includes(subtitles))warnings.push({index:i+1,shotId:slot.shotId,kind:'subtitles',message:'字幕时间待核对：'+(shot.subtitleTiming?.reason||'尚未按实际发声对齐')});
  return {shotId:slot.shotId,speech,subtitles};
 });
 return {signature:crypto.createHash('sha256').update(JSON.stringify({checks,warnings})).digest('hex'),encoding:'complete',speech:checks.every(c=>c.speech==='checked')?'checked':'needs_review',subtitles:checks.some(c=>!['aligned','not_applicable'].includes(c.subtitles))?'needs_review':checks.every(c=>c.subtitles==='not_applicable')?'not_applicable':'aligned',visual:'unreviewed',warnings};
}
function update(version,selections){
 const review=evaluate(selections);version.warnings=review.warnings;version.review=review;
 version.approvalStale=!!version.approvedAt&&version.approvedReview?.signature!==review.signature;
 if(version.approvedReview?.signature===review.signature)review.visual='reviewed';
 return review;
}
function confirmation(review,input){
 if(!input||input.watched!==true)throw Error('请先观看并勾选已核对画面、动作、声音和字幕');
 if(input.signature!==review.signature)throw Error('审片检查结果已更新，请重新核对提示');
 const note=typeof input.note==='string'?input.note.trim():'';
 if(note.length>2000)throw Error('审片说明请控制在 2000 字以内');
 if(review.warnings.length&&!note)throw Error('仍有声音或字幕待核对项，请填写实际观看结果后通过');
 return {signature:review.signature,watched:true,note};
}
module.exports={evaluate,update,confirmation};
