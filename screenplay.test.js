const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const fs=require('node:fs');
const vm=require('node:vm');
const {createScreenplayApi}=require('./screenplay-api');

test('combined generation validates and returns structured assets without mixing them into screenplay',async()=>{
  const bundle={content:'第1场 外景·车站·夜\n父亲等待女儿。',assets:{characters:[{name:'父亲',type:'主角',notes:'等女儿'},{name:' 父亲 ',type:'主角',notes:'别名重复'}],scenes:[],props:[]}};
  let payload;
  const result=await apiRequest(async(url,options)=>{payload=JSON.parse(options.body);return completion(JSON.stringify(bundle))},{story:'父亲等女儿',includeAssets:true},{authorization:'Bearer test-key'});
  assert.equal(result.status,200);assert.equal(result.result.assets.characters.length,1);
  assert.equal(result.result.content,bundle.content);assert.equal(payload.response_format.type,'json_object');
  const invalid=await apiRequest(async()=>completion(JSON.stringify({content:'剧本',assets:{characters:[]}})),{story:'故事',includeAssets:true},{authorization:'Bearer test-key'});
  assert.equal(invalid.status,502);
});

async function apiRequest(fetchImpl,body,headers={},env={}) {
  const handler=createScreenplayApi({fetchImpl,env});
  const req=Readable.from([JSON.stringify(body)]);
  Object.assign(req,{method:'POST',headers:{host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173',...headers}});
  let status,result;
  await handler(req,{writeHead(value){status=value},end(value){result=JSON.parse(value)}},'/api/screenplay');
  return {status,result};
}
const completion=(content='第1场 外景·车站·夜\n父亲站在雨中。\n女儿：爸，我回来了。',finish='stop')=>({ok:true,json:async()=>({choices:[{finish_reason:finish,message:{content}}]})});
test('DeepSeek receives screenplay-only instructions, story and request-scoped credentials',async()=>{
  let upstream;
  const response=await apiRequest(async(url,options)=>{upstream={url,...options};return completion()}, {story:'父女在车站重逢。',notes:'对白克制',model:'deepseek-flash'},{authorization:'Bearer session-test-key'});
  assert.equal(response.status,200);
  assert.equal(upstream.url,'https://api.deepseek.com/chat/completions');
  assert.equal(upstream.headers.Authorization,'Bearer session-test-key');
  const payload=JSON.parse(upstream.body);
  assert.match(payload.messages[0].content,/不生成分镜/);
  assert.equal(JSON.parse(payload.messages[1].content).故事原文,'父女在车站重逢。');
  assert.equal(JSON.stringify(response).includes('session-test-key'),false);
});
test('missing credentials, blank stories, oversized stories and foreign origins never call DeepSeek',async()=>{
  const unexpected=async()=>{throw Error('Should not call provider')};
  for(const [body,headers,status] of [[{story:'故事'}, {},401],[{story:' '},{},400],[{story:'字'.repeat(60001)},{},400],[{story:'故事'},{origin:'https://foreign.example'},403]]) {
    assert.equal((await apiRequest(unexpected,body,headers)).status,status);
  }
});
test('truncation, empty output, rate limits and rejected credentials produce actionable errors',async()=>{
  for(const [response,expected] of [[completion('半份剧本','length'),/长度上限/],[completion(''),/未返回剧本/],[{ok:false,status:429},/频繁/],[{ok:false,status:401},/Key 无效/]]) {
    const result=await apiRequest(async()=>response,{story:'故事'},{},{DEEPSEEK_API_KEY:'server-test-key'});
    assert.equal(result.status,502);assert.match(result.result.error,expected);
  }
});

function frontend(fetchImpl) {
  const nodes=Object.fromEntries(['scripts','storyTextInput','screenplayNotes','screenplayModel','screenplaySaveState','screenplayMessage'].map(id=>[id,{value:'',textContent:'',innerHTML:''}]));
  nodes.storyTextInput.value='父亲在车站等女儿。女儿回来了。';nodes.screenplayModel.value='deepseek-flash';
  const D={activeProjectId:'p1',projects:[{id:'p1',name:'归来',bible:{}},{id:'p2',name:'第二部',bible:{}}],scripts:[],shots:[{id:'existing',desc:'unchanged'}],jobs:[]};
  let saved='',next=0;
  const context=vm.createContext({D,document:{getElementById:id=>nodes[id]},activeProject:()=>D.projects.find(p=>p.id===D.activeProjectId),items:kind=>D[kind].filter(item=>item.projectId===D.activeProjectId),esc:s=>String(s??'').replace(/</g,'&lt;'),uid:()=>`script-${++next}`,localStorage:{setItem(key,value){saved=value}},location:{protocol:'http:'},fetch:async(url,options)=>url.endsWith('/config')?{ok:false}:fetchImpl(url,options),AbortSignal,renderScripts(){}});
  vm.runInContext(fs.readFileSync('screenplay.js','utf8'),context);
  return {context,D,nodes,saved:()=>saved,run:expression=>vm.runInContext(expression,context)};
}
const scriptResponse=()=>({ok:true,headers:{get:()=> 'application/json'},json:async()=>({content:'第1场 外景·车站·夜\n父女相拥。',model:'deepseek-flash',assets:{characters:[{name:'父亲',type:'主角',notes:'在车站等女儿'}],scenes:[{name:'车站',type:'室外',notes:'夜晚'}],props:[]}})});
test('generation and revisions preserve screenplay edits without creating shots or persisting keys',async()=>{
  const app=frontend(async()=>scriptResponse());
  await app.run("screenplayApiKey='memory-key';generateScreenplay()");
  app.run("saveScreenplayField('content','我的修改')");
  await app.run('generateScreenplay()');
  assert.equal(app.D.scripts.length,2);assert.equal(app.D.scripts[0].content,'我的修改');
  assert.equal(app.D.scripts[1].kind,'screenplay');
  assert.deepEqual(app.D.shots,[{id:'existing',desc:'unchanged'}]);assert.equal(app.D.jobs.length,0);
  assert.equal(app.saved().includes('memory-key'),false);
  assert.doesNotMatch(app.nodes.scripts.innerHTML,/onclick="(?:breakStoryIntoShots|scriptToShot)/);
});
test('duplicate clicks are coalesced and switching projects does not misfile the result',async()=>{
  let release,calls=0;
  const app=frontend(async()=>{calls++;await new Promise(resolve=>release=resolve);return scriptResponse()});
  const pending=app.run('generateScreenplay()');await app.run('generateScreenplay()');
  app.D.activeProjectId='p2';release();await pending;
  assert.equal(calls,1);assert.equal(app.D.scripts[0].projectId,'p1');assert.equal(app.D.projects[1].screenplayId,undefined);
});
test('failed generation preserves existing screenplay and source',async()=>{
  const app=frontend(async()=>{throw Error('offline')});
  app.D.scripts.push({id:'old',projectId:'p1',kind:'screenplay',content:'已有剧本',createdAt:new Date().toISOString()});
  await app.run('generateScreenplay()');
  assert.equal(app.D.scripts.length,1);assert.equal(app.D.scripts[0].content,'已有剧本');
  assert.equal(app.D.projects[0].storyText,app.nodes.storyTextInput.value);
});

test('deleting a legacy script preserves production data and respects project boundaries',()=>{
  const app=frontend(async()=>scriptResponse());
  app.context.confirm=()=>true;
  app.D.scripts.push({id:'legacy',projectId:'p1',title:'旧剧本',autoStoryboard:true,content:'正文'}, {id:'other',projectId:'p2',title:'其他项目'});
  app.D.shots[0]={id:'existing',projectId:'p1',scriptId:'legacy',script:'镜头正文',status:'完成'};
  app.D.jobs.push({id:'job',shot:'existing'});
  app.run('renderScripts()');assert.match(app.nodes.scripts.innerHTML,/删除这份剧本/);
  app.run('deleteSavedScript("other")');assert.equal(app.D.scripts.length,2);
  app.run('deleteSavedScript("legacy")');
  assert.equal(app.D.scripts.length,1);assert.equal(app.D.scripts[0].id,'other');
  assert.deepEqual(JSON.parse(JSON.stringify(app.D.shots)),[{id:'existing',projectId:'p1',scriptId:null,script:'镜头正文',status:'完成'}]);
  assert.deepEqual(app.D.jobs,[{id:'job',shot:'existing'}]);
  assert.equal(JSON.parse(app.saved()).scripts.length,1);
});

test('cancelled deletion and failed persistence both retain the old script',()=>{
  const app=frontend(async()=>scriptResponse());
  app.D.scripts.push({id:'legacy',projectId:'p1',title:'旧剧本'});
  app.context.confirm=()=>false;
  app.run('deleteSavedScript("legacy")');assert.equal(app.D.scripts.length,1);
  app.context.confirm=()=>true;
  app.context.localStorage.setItem=()=>{throw Error('Storage full')};
  app.run('deleteSavedScript("legacy")');assert.equal(app.D.scripts.length,1);
  assert.match(app.nodes.scripts.innerHTML,/删除未保存成功/);
});

test('assets are project scoped, reused on regeneration, and preserve manual edits and media',async()=>{
  const app=frontend(async()=>scriptResponse());
  app.D.characters=[{id:'other-father',projectId:'p2',name:'父亲',assetId:'CH_001'}];
  await app.run('generateScreenplay()');
  const father=app.D.characters.find(a=>a.projectId==='p1');father.notes='人工修改';father.imageUrl='reference.png';
  await app.run('generateScreenplay()');
  assert.equal(app.D.characters.length,2);assert.equal(app.D.scenes.length,1);
  assert.equal(father.notes,'人工修改');assert.equal(father.imageUrl,'reference.png');
  assert.equal(app.D.scripts[1].characterIds[0],father.id);
  assert.equal(app.D.jobs.length,0);assert.equal(app.D.shots.length,1);
});

test('failed combined persistence leaves screenplay and all assets unchanged',async()=>{
  const app=frontend(async()=>scriptResponse());let writes=0;
  app.context.localStorage.setItem=()=>{if(++writes===2)throw Error('Storage full')};
  await app.run('generateScreenplay()');
  assert.equal(app.D.scripts.length,0);assert.equal(app.D.characters,undefined);
  assert.equal(app.D.projects[0].screenplayId,undefined);
  assert.match(app.nodes.scripts.innerHTML,/本次剧本与资产未保存/);
});

test('story stage saves the full original and creative baseline before navigation',()=>{
  const app=frontend(async()=>scriptResponse());let destination;
  for(const key of ['logline','synopsis','theme','genre','style'])app.nodes['b_'+key]={value:'测试'+key};
  app.nodes.storyStageText={value:'完整故事，不能被梗概覆盖'};app.nodes.storyStageStatus={};
  app.context.go=id=>destination=id;
  app.run('storyStageNext()');
  assert.equal(destination,'scripts');assert.equal(app.D.projects[0].storyText,'完整故事，不能被梗概覆盖');
  assert.equal(app.D.projects[0].bible.synopsis,'测试synopsis');
  destination=null;app.nodes.storyStageText.value='未保存';app.context.localStorage.setItem=()=>{throw Error('full')};
  app.run('storyStageNext()');assert.equal(destination,null);assert.equal(app.D.projects[0].storyText,'完整故事，不能被梗概覆盖');
});
