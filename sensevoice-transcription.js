function normalizeResult(raw){
 if(!raw||typeof raw.text!=='string'||!Number.isFinite(raw.duration)||raw.duration<=0)throw Error('中文识别返回格式异常');
 const tokens=raw.tokens||[],times=raw.timestamps||[];
 const timed=tokens.length&&tokens.length===times.length&&times.every((t,i)=>Number.isFinite(t)&&t>=0&&t<raw.duration&&(i===0||t>=times[i-1]));
 const segments=[];
 if(timed&&tokens.join('').replace(/\s/g,'')===raw.text.replace(/[\p{P}\p{Z}\s]/gu,'')){
  let group;
  tokens.forEach((token,i)=>{if(!group||times[i]-times[i-1]>0.65){group={start:times[i],end:Math.min(raw.duration,times[i]+0.3),text:token};segments.push(group)}else{group.text+=token;group.end=Math.min(raw.duration,times[i]+0.3)}});
 }else if(raw.text.trim())segments.push({start:0,end:raw.duration,text:raw.text});
 return {model:'sensevoice-int8',method:'independent-chinese',segments,raw,expectedPhonemes:raw.expectedPhonemes,phonemes:raw.phonemes,timingSource:timed?'recognizer-tokens':'whole-clip'};
}
module.exports={normalizeResult};
