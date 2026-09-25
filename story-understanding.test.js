const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{Readable}=require('node:stream'),U=require('./story-understanding');
const story=fs.readFileSync('fixtures/scene05-story.txt','utf8').trim();
function contract(){return U.parse({characters:[{id:'C1',name:'西门清',aliases:['我'],evidence:'我叫**西门清**'}],facts:[
 {id:'F1',kind:'negative',statement:'第一次密码失败，第二次开门',delivery:'visual',evidence:'密码输入了两次才打开门'},
 {id:'F2',kind:'negative',statement:'进门不开灯，仅外部灯火',delivery:'visual',evidence:'西门清进门后没有开灯，外面的灯火照亮了房间'}],beats:[
 {id:'B1',action:'第一次输入，门未开',before:'门锁着',after:'仍锁着',place:'1606房门口',time:'2024年04月30日夜',evidence:'密码输入了两次才打开门',factIds:['F1']},
 {id:'B2',action:'第二次输入成功，开门',before:'门仍锁着',after:'门打开',place:'1606房门口',time:'2024年04月30日夜',evidence:'密码输入了两次才打开门',factIds:['F1']},
 {id:'B3',action:'走入暗室，不开灯',before:'门开着',after:'人物在房间里，灯仍关着',place:'租住房间',time:'2024年04月30日夜',evidence:'西门清进门后没有开灯，外面的灯火照亮了房间',factIds:['F2']}],ambiguities:[]},story)}
const shots=()=>[{beatIds:['B1'],action:'输密码后失败，门仍锁着',visual:'人站在门外',dialogue:''},{beatIds:['B2'],action:'重新输入后门锁开启',visual:'门打开',dialogue:''},{beatIds:['B3'],action:'进入且不开灯',visual:'仅窗外城市灯火照明',dialogue:''}];
test('scene five evidence is grounded in the original, aliases are unique, changed text cannot reuse understanding',()=>{
 const u=contract();assert.equal(u.characters.length,1);assert.deepEqual(u.characters[0].aliases,['我']);assert.equal(u.sourceHash.length,64);
 const bad=structuredClone(u);bad.beats[0].evidence='第一遍就打开了门';assert.throws(()=>U.parse(bad,story),/不在原文/);
 const duplicate=structuredClone(u);duplicate.characters.push({id:'C2',name:'我',aliases:[],evidence:'我叫**西门清**'});assert.throws(()=>U.parse(duplicate,story),/多.*角色/);
 assert.throws(()=>U.parse(u,story+'后来开灯了。'),/原文已变化/);
});
test('missing retries and reordered outcomes stop coverage even if the model labels them covered',()=>{
 const u=contract(),s=shots();assert.deepEqual(U.coverage(u,s),[]);
 assert.match(U.coverage(u,s.slice(1)).join('\n'),/B1/);assert.match(U.coverage(u,[s[1],s[0],s[2]]).join('\n'),/顺序/);
 assert.deepEqual(U.coverage(u,[s[0],s[1],s[0],s[2]]),[]);
 assert.throws(()=>U.annotate([{beatIds:['B999']}],u),/无效动作/);
 const bound=U.annotate(s,u);assert.equal(bound[2].storyBinding.facts[0].id,'F2');assert.equal(bound[2].storyBinding.beats[0].after,'人物在房间里，灯仍关着');
});
test('first-person prose and waiter actions cannot authorize invented spoken dialogue',()=>{
 const u=contract();for(const text of ['今天是我40岁的生日','敬您一杯。'])assert.throws(()=>U.checkSpeech([{type:'speech',text,speakerId:'C1',speakerName:'西门清',delivery:'onscreen'}],u,story),/原文未明确/);
 assert.throws(()=>U.checkScreenplay('第1场\n西门清：今天是我40岁的生日',u,story),/原文未明确/);
 const news='新闻播报：三名航天员安全返回。',n=structuredClone(u);n.facts.push({id:'F3',delivery:'speech',evidence:news});assert.doesNotThrow(()=>U.checkSpeech([{type:'speech',text:'三名航天员安全返回。',speakerName:'新闻播报'}],n,news));
});
test('independent semantic review needs every fact and real referenced shot, never claims the video passed',()=>{
 const u=contract(),s=shots(),result={beats:u.beats.map((b,i)=>({id:b.id,status:'covered',shotIndexes:[i+1],reason:'本镜动作有对应'})),facts:u.facts.map(f=>({id:f.id,status:'consistent',reason:'没有冲突'})),issues:[]};
 const review=U.parseReview(JSON.stringify(result),u,s);assert.equal(review.status,'checked');assert.equal(review.scope,'storyboard_plan');
 result.facts[1]={id:'F2',status:'contradiction',reason:'分镜把主灯打开了'};assert.equal(U.parseReview(JSON.stringify(result),u,s).status,'needs_revision');
 result.beats[0].shotIndexes=[3];assert.equal(U.parseReview(JSON.stringify(result),u,s).status,'needs_revision');result.beats[0].shotIndexes=[99];assert.throws(()=>U.parseReview(JSON.stringify(result),u,s),/不存在/);
 const edited=shots();edited[2].visual='主灯全亮';assert.notEqual(U.key(u,edited),review.checkedKey);
 const canonical=shots();canonical[0].script='用户改为开灯';assert.notEqual(U.key(u,canonical),review.checkedKey);
});
test('source contract survives full API payload instead of being truncated into optional notes',async()=>{
 const u=contract(),longStory=story+'\n'+('背景段落。'.repeat(1000)),full=U.parse({...u,sourceHash:undefined},longStory);let sent;
 const api=require('./screenplay-api').createScreenplayApi({env:{DEEPSEEK_API_KEY:'test'},fetchImpl:async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(full)}}]})}}});
 const req=Readable.from([JSON.stringify({story:longStory})]);Object.assign(req,{method:'POST',headers:{host:'127.0.0.1:4173'}});let status,out;await api(req,{writeHead(n){status=n},end(s){out=JSON.parse(s)}},'/api/screenplay/understanding');assert.equal(status,200,out.error);assert.equal(JSON.parse(sent.messages[1].content).sourceStory,longStory);
});
test('schema repair retries are bounded and network failures are not treated as model repair',async()=>{
 let n=0;await assert.rejects(()=>U.checked(async()=>{n++;throw Object.assign(Error('bad JSON'),{repair:{content:'draft',error:'bad'}})},'url',{}),/bad JSON/);assert.equal(n,3);
 n=0;await assert.rejects(()=>U.checked(async()=>{n++;throw Error('offline')},'url',{}),/offline/);assert.equal(n,1);
});

test('changing a final video prompt invalidates the prior story-plan review',()=>{
 const u=contract(),s=shots(),before=U.key(u,s);s[0].prompt='He enters the password and immediately opens the door.';
 assert.notEqual(U.key(u,s),before);assert.equal(U.shotContent(s[0]).prompt,s[0].prompt);
});
test('preflight saves corrected action bindings once and rejects edits during independent review',async()=>{
 const vm=require('node:vm');
 for(const edited of [false,true]){
  const u=contract(),list=shots().map((s,i)=>({...s,id:'S'+i,projectId:'P',sequence:i+1,storyboardBatchId:'B',beatIds:[]}));
  const result={beats:u.beats.map((b,i)=>({id:b.id,status:'covered',shotIndexes:[i+1],reason:'实际画面有动作'})),facts:u.facts.map(f=>({id:f.id,status:'consistent',reason:'无冲突'})),issues:[]};
  const ctx={StoryUnderstanding:U,D:{activeProjectId:'P',shots:list,storyboardBatches:[{id:'B',projectId:'P',sourceStory:story,storyUnderstanding:u}]},activeProject:()=>({}),localStorage:{setItem(){}},calls:0};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync('story-understanding-ui.js','utf8'),ctx);
  ctx.answer=async()=>{ctx.calls++;const review=U.parseReview(JSON.stringify(result),u,list);if(edited)list[0].action='编辑后的动作';return {review}};
  vm.runInContext('storyAIRequest=answer',ctx);
  if(edited){await assert.rejects(ctx.ensureStoryCoverage(list),/已修改/);assert.equal(ctx.D.storyboardBatches[0].storyReview,undefined)}
  else {await ctx.ensureStoryCoverage(list);await ctx.ensureStoryCoverage(list);assert.equal(ctx.calls,1);assert.equal(list[0].storyBinding.beats[0].id,'B1');assert.equal(ctx.D.storyboardBatches[0].storyReview.checkedKey,U.key(u,list))}
 }
});
