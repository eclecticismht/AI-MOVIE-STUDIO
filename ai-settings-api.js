const Provider=require('./ai-provider');
function createSettingsApi({store=require('./ai-credentials').store,env=process.env,fetchImpl=fetch}={}){
 return async function(req,res,pathname){
  if(!['/api/ai/settings','/api/ai/test'].includes(pathname))return false;
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
  if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){send(403,{error:'请从本地工作室设置 AI'});return true;}
  try{
   const status=()=>{const local=store.status();return {local,configured:{openai:local.openai||!!env.OPENAI_API_KEY,deepseek:local.deepseek||!!env.DEEPSEEK_API_KEY}}};
   if(pathname==='/api/ai/settings'&&req.method==='GET'){send(200,status());return true;}
   if(req.method!=='POST'){send(405,{error:'操作不支持'});return true;}
   const input=JSON.parse(await require('./request-body').readUtf8(req,5000));
   if(pathname==='/api/ai/settings'){await store.set(input.provider,input.key?.trim());send(200,status());return true;}
   const model=input.model,p=Provider.provider(model),key=await store.get(p)||(p==='openai'?env.OPENAI_API_KEY:env.DEEPSEEK_API_KEY);if(!key)throw Error('请先保存 '+(p==='openai'?'OpenAI':'DeepSeek')+' API Key');
   const response=await fetchImpl(Provider.base(p)+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({model,...Provider.options(model,2048),response_format:{type:'json_object'},messages:[{role:'system',content:'Return only a JSON object.'},{role:'user',content:'Return {"ok":true}.'}]}),signal:AbortSignal.timeout(60000)});
   if(!response.ok)throw Error(await Provider.failure(response,p));const result=await response.json(),choice=result.choices?.[0];if(choice?.finish_reason!=='stop'||!choice.message?.content?.trim())throw Error('接口已连接，但模型未完成测试输出，请换用其他模型或重试');
   try{JSON.parse(choice.message.content)}catch{throw Error('模型输出不符合 JSON 格式，暂不适合结构化分镜生成')}
   send(200,{ok:true,model,message:'连接成功，当前模型可以返回结构化内容。'});
  }catch(e){send(400,{error:/timeout|abort/i.test(e.name)?'连接测试超时，请检查网络后重试':e.message==='fetch failed'?'无法连接 AI 服务，请检查网络或代理设置':e.message})}return true;
 };
}
module.exports={createSettingsApi};
