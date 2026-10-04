// Conservative segment scoping: only exact evidence located wholly in another
// screenplay segment is excluded. Paraphrased or cross-boundary beats stay available.
const normalize=value=>String(value||'').replace(/&#x20;|&nbsp;/gi,' ').replace(/\*\*/g,'').replace(/\s+/g,'');
function create(screenplay,understanding,input){
 if(input===undefined||input===null)return null;
 if(!input||!Array.isArray(input.segments)||!input.segments.length||input.segments.length>160||!Number.isInteger(input.index)||input.index<0||input.index>=input.segments.length)throw Error('分镜片段范围无效，请重新读取已保存进度。');
 const parts=input.segments;
 if(parts.some(p=>typeof p!=='string'||!p.trim())||parts.reduce((n,p)=>n+p.length,0)>120000||parts[input.index]!==screenplay)throw Error('当前分镜片段与保存的范围不一致，未使用其他片段代替。');
 const texts=parts.map(normalize),current=texts[input.index],foreign=new Map();
 for(const beat of understanding?.beats||[]){
  const evidence=normalize(beat.evidence);if(!evidence||current.includes(evidence))continue;
  const owners=texts.flatMap((part,index)=>index!==input.index&&part.includes(evidence)?[index]:[]);
  if(owners.length)foreign.set(beat.id,owners);
 }
 const scopedUnderstanding=understanding?{...understanding,beats:understanding.beats.filter(b=>!foreign.has(b.id))}:null;
 return {index:input.index,total:parts.length,current,texts,foreign,understanding:scopedUnderstanding};
}
function inspect(shots,scope){
 if(!scope||!Array.isArray(shots))return {issues:[],removableIndexes:[]};
 const issues=[],removableIndexes=[];
 for(const [i,shot] of shots.entries()){
  if(!shot||typeof shot!=='object')continue;
  const ids=Array.isArray(shot.beatIds)?shot.beatIds:[],outside=ids.filter(id=>scope.foreign.has(id));
  const excerpt=normalize(shot.sourceExcerpt),elsewhere=excerpt&&!scope.current.includes(excerpt)?scope.texts.flatMap((s,index)=>index!==scope.index&&s.includes(excerpt)?[index]:[]):[];
  if(!outside.length&&!elsewhere.length)continue;
  const onlyForeign=ids.length>0&&ids.every(id=>scope.foreign.has(id));
  // A clearly located foreign excerpt is removable only when no retained beat
  // claims current action; mixed claims must be corrected rather than discarded.
  const removable=onlyForeign||elsewhere.length>0&&!ids.length;
  if(removable)removableIndexes.push(i+1);
  const owners=[...new Set([...outside.flatMap(id=>scope.foreign.get(id)),...elsewhere])].map(n=>n+1).sort((a,b)=>a-b);
  issues.push('第 '+(i+1)+' 条：当前仅生成第 '+(scope.index+1)+'/'+scope.total+' 段；'+(outside.length?'动作 '+outside.join('、')+' ':'引用 ')+'属于其他第 '+owners.join('、')+' 段。'+(removable?'此条为越界镜头，请用 corrections 的 shots:[] 移除；由所属片段单独生成，不能伪造本段 sourceExcerpt。':'保留本段真实动作，只移除越界动作引用；不能提前加入其他片段的画面、台词或结尾。'));
 }
 return {issues,removableIndexes};
}
function assert(shots,scope){const result=inspect(shots,scope);if(result.issues.length)throw Error(result.issues.join('\n'));}
function promptScope(scope){return scope?{segmentIndex:scope.index+1,totalSegments:scope.total,rule:'Only storyboard the current screenplay segment. Other segments are generated separately. Do not invent an ending or add missing future dialogue. All excerpts must come from the current segment.'}:undefined;}
module.exports={create,inspect,assert,promptScope};
