const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const normalize=s=>String(s||'').normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu,'').toLowerCase();
function spokenInteger(digits){
 if(digits==='0')return '零';let result='',gap=false;
 for(let i=0;i<digits.length;i++){const digit=Number(digits[i]),place=digits.length-i-1;if(!digit){if(result)gap=true;continue}if(gap){result+='零';gap=false}if(!(digit===1&&place===1&&!result))result+='零一二三四五六七八九'[digit];result+=['','十','百','千'][place]}
 return result;
}
function comparisonText(value){
 let text=String(value||'').normalize('NFKC');
 // Chinese year digits and decimal digits are equivalent spoken forms, not omitted digits.
 text=text.replace(/[零〇一二三四五六七八九]{4}(?=年)/g,year=>Array.from(year,c=>String('零一二三四五六七八九'.indexOf(c==='〇'?'零':c))).join(''));
 text=text.replace(/(?<![\d.])(\d{1,4})\.(\d{1,4})(?![\d.])/g,(all,whole,fraction)=>whole.length>1&&whole[0]==='0'?all:spokenInteger(whole)+'点'+Array.from(fraction,c=>'零一二三四五六七八九'[Number(c)]).join(''));
 return normalize(text.replace(/\d+/g,(digits,offset)=>{
  if(digits.length>4||digits.length>1&&digits[0]==='0'||text[offset-1]==='.'||text[offset+digits.length]==='.')return digits;
  return spokenInteger(digits);
 }));
}
function distance(a,b){let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]+1,row[j+1]+1,row[j]+(a[i]===b[j]?0:1)));row=next}return row[b.length]}
function phoneticMatch(expected,actual){
 // ASR may assign a lexical tone to an unstressed particle (了 -> 乐).
 // Keep every consonant/vowel and every non-neutral tone strict; never permit omissions.
 return Array.isArray(expected)&&expected.length>0&&Array.isArray(actual)&&expected.length===actual.length&&expected.every((p,i)=>p===actual[i]||(/^(le|de|ma|ne|ba|a|zhe)5$/.test(p)&&p.slice(0,-1)===String(actual[i]).replace(/[1-5]$/,'')));
}
function selectTranscription(result){
 const candidates=[{method:result.method||'vad',segments:result.segments,phonemes:result.phonemes},...(result.alternatives||[])];
 const expected=comparisonText(result.normalizedExpected);
 if(!expected||candidates.length<2)return result;
 const score=c=>distance(expected,comparisonText(c.segments.map(s=>s.normalizedText??s.text).join('')));
 const selected=candidates.reduce((best,c)=>score(c)<score(best)?c:best);
 return {...result,method:selected.method,segments:selected.segments,phonemes:selected.phonemes,recognitionAttempts:candidates};
}
function compareSpeech(events,transcription){
  if(!Array.isArray(events))return {status:'unverifiable',reason:'旧任务没有结构化对白，不能自动判断原句和说话人物。',transcription};
  const spoken=events.filter(e=>e.type==='speech'),expected=spoken.map(e=>e.text).join(''),actual=transcription.segments.map(s=>s.text).join('');
  const a=comparisonText(transcription.normalizedExpected??expected),b=comparisonText(transcription.segments.map(s=>s.normalizedText??s.text).join('')),edits=distance(a,b);
  const homophones=edits>0&&a.length>0&&phoneticMatch(transcription.expectedPhonemes,transcription.phonemes);
  return {status:edits?(homophones?'pronunciation_match':'needs_review'):'text_match',expected,actual,edits,characterErrorRate:edits/Math.max(a.length,1),speakers:spoken.map(e=>({name:e.speakerName,delivery:e.delivery})),speakerIdentity:'not_verified',reason:homophones?'转写存在同音字或轻声助词歧义，转写音节可对应原句；这不是对实际声调的测量，人物和口型仍需观看确认。':edits?(a?'识别台词与剧本不同，请试听确认；识别本身也可能出错。':'此镜头应无对白，但识别到了声音文字，请试听确认。'):'文字识别一致；说话人物、口型和故事表达仍需观看确认。',transcription};
}
function transcribe(file,expected='',model='small'){return new Promise((resolve,reject)=>{
  if(!['small','medium','large-v3','sensevoice'].includes(model))return reject(Error('本地语音模型选项无效'));
  const python=process.env.AMS_ASR_PYTHON||'C:\\AI\\Comfy UI\\ComfyUI\\.venv\\Scripts\\python.exe';
  const modelFile=model==='sensevoice'?'.runtime/models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17/model.int8.onnx':`.runtime/models/whisper-${model}/model.bin`;
  if(!fs.existsSync(python)||!fs.existsSync(path.join(__dirname,modelFile)))return reject(Error('所选本地语音识别模型尚未安装。'));
  const args=model==='sensevoice'?[path.join(__dirname,'transcribe-sensevoice.py'),'--expected',expected,file]:[path.join(__dirname,'transcribe-local.py'),file,expected,model];
  const proc=spawn(python,args,{windowsHide:true,cwd:__dirname,stdio:['ignore','pipe','pipe']});let out=[],err='';const timer=setTimeout(()=>{proc.kill();reject(Error('语音识别超时，请重试。'))},10*60*1000);
  proc.stdout.on('data',b=>out.push(b));proc.stderr.on('data',b=>{err=(err+b).slice(-2000)});proc.on('error',e=>{clearTimeout(timer);reject(e)});proc.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(Error('语音识别失败：'+err));try{const raw=JSON.parse(Buffer.concat(out).toString('utf8'));resolve(model==='sensevoice'?require('./sensevoice-transcription').normalizeResult(raw[0]):selectTranscription(raw))}catch{reject(Error('语音识别返回格式异常。'))}});
})}
module.exports={compareSpeech,transcribe,normalize,selectTranscription};
