// Correct only failed candidate rows; previously accepted segments are not edited.
const instructions='\n当前为局部修正模式：只输出JSON {"corrections":[{"index":1,"shots":[{完整修正后的单镜对象}]}]}。index为上次shots中从1开始的镜头序号，只列出错误消息点名的行。不要重复整张表。需要拆镜时同一个index的shots可放多镜；其余镜头原样保留。只有错误明确标记为可移除的越界镜头，才用 {"index":该行序号,"shots":[]} 移除，由所属片段稍后生成；禁止删除本段真实行动或台词。不要为通过校验把别处的情节换绑成本段的一句原文。混合了本段和其他片段动作的镜头须保留本段动作，只修正越界的画面和beatIds。不要解释，不得改变原文。对于screenText不在原文的错误，只保留sourceExcerpt中确实逐字出现的短片段；不能把不相邻的词拼成新句。';
function merge(content,repair,{removableIndexes=[]}={}){
 const out=JSON.parse(content);if(Array.isArray(out.shots))return content;
 if(!repair||!Array.isArray(out.corrections)||!out.corrections.length||out.corrections.length>160)throw Error('请返回完整shots或有效的corrections');
 const original=JSON.parse(repair.content),seen=new Set(),removable=new Set(removableIndexes);if(!Array.isArray(original.shots))throw Error('没有可修正的原分镜');
 for(const c of out.corrections){
  if(!Number.isInteger(c.index)||c.index<1||c.index>original.shots.length||seen.has(c.index)||!Array.isArray(c.shots)||c.shots.length>20)throw Error('局部修正镜头序号或数量无效');
  if(!c.shots.length&&!removable.has(c.index))throw Error('第 '+c.index+' 条尚未确认属于其他片段，不允许直接删除本段镜头。');
  seen.add(c.index);
 }
 for(const c of out.corrections)if(!c.shots.length&&original.shots[c.index]?.continuePrevious&&!seen.has(c.index+1))throw Error('移除越界镜头时须同时修正其承接后镜，不能承接到错误的前镜。');
 for(const c of [...out.corrections].sort((a,b)=>b.index-a.index))original.shots.splice(c.index-1,1,...c.shots);
 if(!original.shots.length||original.shots.length>160)throw Error('局部修正后必须保留有效的本段镜头；不能清空整个片段。');
 return JSON.stringify(original);
}
module.exports={instructions,merge};
