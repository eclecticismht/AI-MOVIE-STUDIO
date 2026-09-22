const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{Readable}=require('node:stream');
const {createStore,protect}=require('./ai-credentials'),{createSettingsApi}=require('./ai-settings-api'),{createScreenplayApi}=require('./screenplay-api');
test('Windows local credential encryption persists both providers without plaintext', {skip:process.platform!=='win32'},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ams-credentials-')),file=path.join(dir,'credentials.json');
 try{const store=createStore({file});await Promise.all([store.set('deepseek','unit-deepseek-value'),store.set('openai','unit-openai-value')]);const text=fs.readFileSync(file,'utf8');assert.ok(!text.includes('unit-'));const reopened=createStore({file});assert.equal(await reopened.get('deepseek'),'unit-deepseek-value');assert.equal(await reopened.get('openai'),'unit-openai-value');await reopened.set('openai','');assert.equal(await reopened.get('openai'),'');assert.equal(await reopened.get('deepseek'),'unit-deepseek-value');}finally{for(const file of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,file));fs.rmdirSync(dir)}
});
async function request(handler,route,body,headers={}){const req=Readable.from(body===undefined?[]:[JSON.stringify(body)]);Object.assign(req,{method:body===undefined?'GET':'POST',headers:{host:'127.0.0.1:4173',...headers}});let status,result;await handler(req,{writeHead:s=>status=s,end:s=>result=JSON.parse(s)},route);return {status,result};}
test('local settings never return credentials and test routes use only selected provider key',async()=>{
 const keys={deepseek:'dummy-deepseek-value',openai:'dummy-openai-value'},store={status:()=>({deepseek:true,openai:true}),get:async p=>keys[p],set:async(p,k)=>keys[p]=k};let authorization;
 const api=createSettingsApi({store,env:{},fetchImpl:async(u,o)=>{authorization=o.headers.Authorization;assert.match(u,/api.deepseek.com/);return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}]})}}});
 const status=await request(api,'/api/ai/settings');assert.ok(!JSON.stringify(status).includes('dummy'));
 assert.equal((await request(api,'/api/ai/test',{model:'deepseek-flash'})).status,200);assert.equal(authorization,'Bearer dummy-deepseek-value');
 assert.equal((await request(api,'/api/ai/settings',{provider:'openai',key:'unwanted'},{origin:'https://foreign.example'})).status,403);assert.equal(keys.openai,'dummy-openai-value');
});
test('generation resolves persisted credentials without browser authorization',async()=>{
 for(const model of ['deepseek-flash','gpt-5.4']){let actual;const api=createScreenplayApi({env:{},credentialStore:{get:async p=>'dummy-'+p,status:()=>({})},fetchImpl:async(u,o)=>{actual=o.headers.Authorization;return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'剧本'}}]})}}});const r=await request(api,'/api/screenplay',{model,story:'故事'});assert.equal(r.status,200);assert.equal(actual,'Bearer dummy-'+(model.startsWith('gpt-')?'openai':'deepseek'));}
});
test('provider errors never echo raw upstream contents',async()=>{const error=await require('./ai-provider').failure({status:401,json:async()=>({error:{message:'secret-token',code:'bad'}})},'deepseek');assert.match(error,/Key 无效/);assert.ok(!error.includes('secret-token'));});
