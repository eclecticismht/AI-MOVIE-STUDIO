// Let the model correct only failed rows instead of reproducing a long table.
const instructions='\n当前为局部修正模式：只输出JSON {"corrections":[{"index":1,"shots":[{完整修正后的单镜对象}]}]}。index为上次shots中从1开始的镜头序号，只列出错误消息点名的行。不要重复整张表。需要拆镜时同一个index的shots可放多镜；其余镜头原样保留。不要解释，不得改变原文。对于screenText不在原文的错误，只保留sourceExcerpt中确实逐字出现的短片段；不能把不相邻的词拼成新句。';
function merge(content,repair){
 const out=JSON.parse(content);if(Array.isArray(out.shots))return content;
 if(!repair||!Array.isArray(out.corrections)||!out.corrections.length||out.corrections.length>160)throw Error('请返回完整shots或有效的corrections');
 const original=JSON.parse(repair.content),seen=new Set();if(!Array.isArray(original.shots))throw Error('没有可修正的原分镜');
 for(const c of out.corrections){if(!Number.isInteger(c.index)||c.index<1||c.index>original.shots.length||seen.has(c.index)||!Array.isArray(c.shots)||!c.shots.length||c.shots.length>20)throw Error('局部修正镜头序号或数量无效');seen.add(c.index)}
 for(const c of [...out.corrections].sort((a,b)=>b.index-a.index))original.shots.splice(c.index-1,1,...c.shots);
 return JSON.stringify(original);
}
module.exports={instructions,merge};
