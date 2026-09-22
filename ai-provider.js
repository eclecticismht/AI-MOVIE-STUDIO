function provider(model){if(typeof model!=='string'||!/^(?:deepseek|gpt)-[a-zA-Z0-9._-]+$/.test(model))throw Error('模型名称无效，请选择 DeepSeek 或 GPT 模型');return model.startsWith('gpt-')?'openai':'deepseek'}
const base=p=>p==='openai'?'https://api.openai.com/v1':'https://api.deepseek.com';
function options(model,max=16000){return provider(model)==='openai'?{max_completion_tokens:max}:{max_tokens:max,thinking:{type:'disabled'}}}
async function failure(response,p){
 const name=p==='openai'?'OpenAI':'DeepSeek';let code='';try{code=(await response.json()).error?.code||''}catch{}
 if(response.status===429&&/quota|balance|credit/i.test(code))return name+' API 余额或额度不足，请检查 API 账户余额。';
 return ({400:name+' 不接受当前模型或请求参数，请使用“测试当前模型”核对模型兼容性。',401:name+' API Key 无效，请重新保存密钥。',402:name+' API 余额不足，请充值 API 账户。',403:name+' API 访问被拒绝，请检查账户权限或地区限制。',404:name+' 模型不存在或当前账户无权使用，请更换模型。',429:name+' 请求额度不足或过于频繁，请稍后重试。'})[response.status]||name+' 服务暂时不可用（'+response.status+'）';
}
module.exports={provider,base,options,failure};
