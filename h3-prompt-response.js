const {isStructured}=require('./shot-prompt');
function parseResponse(content,shots){
 let output;try{output=JSON.parse(content)}catch{throw Error('视频提示词不是完整 JSON，请重试本批。')}
 if(!Array.isArray(output?.prompts)||output.prompts.length!==shots.length)throw Error('返回的镜头提示词数量不符，请重试本批。');
 const entries=new Map();
 for(const item of output.prompts){
  if(!item||!shots.some(s=>s.id===item.id)||entries.has(item.id))throw Error('返回的镜头编号重复或不属于本批，请重试。');
  const prompt=typeof item.prompt==='string'?item.prompt.trim():'';
  if(!isStructured(prompt))throw Error(`镜头 ${item.id} 缺少完整的画面、环境声或配乐字段，请重试本批。`);
  if(/<d\b/i.test(prompt))throw Error(`镜头 ${item.id} 的画面提示词混入了对白标签，请重试；台词应由已核对的对白字段绑定。`);
  entries.set(item.id,{id:item.id,prompt});
 }
 return shots.map(s=>entries.get(s.id));
}
module.exports={parseResponse};
