const {test}=require('node:test'),assert=require('node:assert/strict'),{Readable}=require('node:stream');
const Scope=require('./storyboard-scope'),Repair=require('./storyboard-repair'),U=require('./story-understanding'),API=require('./screenplay-api');
const parts=['第5场 外景·操场·日\n父亲拉着雪橇跑。','第6场 外景·三楼走廊·日\n母亲低声笑道：“两个憨包。”','第7场 外景·操场·日\n雪还在下。\n父亲又绕了一圈。'];
const story=parts.join('\n\n');
const contract=()=>U.parse({characters:[{id:'C1',name:'父亲',aliases:[],evidence:'父亲拉着雪橇跑。'},{id:'C2',name:'母亲',aliases:[],evidence:'母亲低声笑道：“两个憨包。”'}],facts:[{id:'F1',kind:'place',delivery:'context',statement:'室外',evidence:'外景'}],beats:parts.map((p,i)=>({id:'B'+(i+1),evidence:p.split('\n').slice(1).join('\n'),action:['父亲跑','母亲低声笑','雪中又绕一圈'][i],before:'动作之前',after:'动作之后',place:'当前地点',time:'清晨',factIds:['F1']})),ambiguities:[]},story);
const shot=(excerpt,beat,dialogue='',characters='父亲')=>({scene:'当前场景',sourceExcerpt:excerpt,action:'可见行动',visual:'人物在场景中',camera:'中景',characters,dialogue,duration:6,beatIds:[beat]});
test('exact foreign beats are scoped out but ambiguous and cross-boundary evidence is retained',()=>{
 const u=contract();u.beats.push({id:'B4',evidence:'改写后不能精确定位的动作'},{id:'B5',evidence:parts[0]+'\n'+parts[1]});const s=Scope.create(parts[0],u,{index:0,segments:parts});
 assert.deepEqual([...s.foreign.keys()],['B2','B3']);assert.deepEqual(s.understanding.beats.map(b=>b.id),['B1','B4','B5']);assert.equal(u.beats.length,5);
 assert.equal(Scope.create(parts[0],u),null);assert.throws(()=>Scope.create(parts[0],u,{index:1,segments:parts}),/不一致/);
});
test('a current excerpt cannot launder a future action, line or ending into the current segment',()=>{
 const s=Scope.create(parts[0],contract(),{index:0,segments:parts}),wrong=[shot('父亲拉着雪橇跑。','B2','母亲：两个憨包。','母亲'),shot('雪还在下。\n父亲又绕了一圈。','B3')];
 const result=Scope.inspect(wrong,s);assert.deepEqual(result.removableIndexes,[1,2]);assert.match(result.issues.join('\n'),/其他第 2 段/);assert.throws(()=>API.parseStoryboard(JSON.stringify({shots:wrong}),parts[0],null,s),/越界镜头/);
 const mixed={...wrong[0],beatIds:['B1','B2']};assert.deepEqual(Scope.inspect([mixed],s).removableIndexes,[]);
});
test('local repair removes only independently located foreign candidates, not valid current rows',()=>{
 const original=[shot('父亲拉着雪橇跑。','B1'),shot('父亲拉着雪橇跑。','B2'),shot('雪还在下。\n父亲又绕了一圈。','B3')],repair={content:JSON.stringify({shots:original})};
 const corrections=JSON.stringify({corrections:[{index:2,shots:[]},{index:3,shots:[]}]});assert.throws(()=>Repair.merge(corrections,repair),/不允许/);
 const scope=Scope.create(parts[0],contract(),{index:0,segments:parts}),result=JSON.parse(Repair.merge(corrections,repair,Scope.inspect(original,scope)));assert.deepEqual(result.shots,[original[0]]);assert.equal(JSON.parse(repair.content).shots.length,3);
 assert.throws(()=>Repair.merge(JSON.stringify({corrections:[{index:1,shots:[]}]}),{content:JSON.stringify({shots:[original[1]]})},{removableIndexes:[1]}),/清空/);
 assert.throws(()=>Repair.merge(JSON.stringify({corrections:[{index:1,shots:[]}]}),{content:JSON.stringify({shots:[original[1],{...original[0],continuePrevious:true}]})},{removableIndexes:[1]}),/承接/);
});
test('future lines and endings validate in their own segments without loosening exact citation checks',()=>{
 const u=contract(),a=shot('母亲低声笑道：“两个憨包。”','B2','母亲：两个憨包。','母亲'),b=shot('雪还在下。\n父亲又绕了一圈。','B3');
 assert.equal(API.parseStoryboard(JSON.stringify({shots:[a]}),parts[1],undefined,Scope.create(parts[1],u,{index:1,segments:parts})).length,1);
 assert.equal(API.parseStoryboard(JSON.stringify({shots:[b]}),parts[2],undefined,Scope.create(parts[2],u,{index:2,segments:parts})).length,1);
 assert.throws(()=>API.parseStoryboard(JSON.stringify({shots:[{...b,sourceExcerpt:'父亲又绕了十圈。'}]}),parts[2]),/原文/);
});
test('API scopes the model input and resumes an old repair with all remaining source checks enabled',async()=>{
 const u=contract(),valid=shot('父亲拉着雪橇跑。','B1'),wrong=shot('父亲拉着雪橇跑。','B2','母亲：两个憨包。','母亲');let sent;
 const api=API.createScreenplayApi({env:{DEEPSEEK_API_KEY:'test'},fetchImpl:async(url,opt)=>{sent=JSON.parse(opt.body);return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({corrections:[{index:2,shots:[]}]})}}]})}}});
 const req=Readable.from([JSON.stringify({screenplay:parts[0],sourceStory:story,storyUnderstanding:u,segmentContext:{index:0,segments:parts},repair:{content:JSON.stringify({shots:[valid,wrong]}),error:'原句不在本段'}})]);Object.assign(req,{method:'POST',headers:{host:'127.0.0.1:4173'}});let status,out;
 await api(req,{writeHead(s){status=s},end(s){out=JSON.parse(s)}},'/api/storyboard');assert.equal(status,200,out.error);assert.equal(out.shots.length,1);assert.equal(out.shots[0].sourceExcerpt,valid.sourceExcerpt);
 const body=JSON.parse(sent.messages[1].content);assert.equal(body.sourceStory,undefined);assert.equal(body.剧本正文,parts[0]);assert.deepEqual(body.storyUnderstanding.beats.map(b=>b.id),['B1']);assert.equal(body.generationScope.totalSegments,3);assert.match(sent.messages.at(-1).content,/shots:\[\]/);
});
test('resuming completed segments sends only missing segment with saved boundaries and keeps prior shots',async()=>{
 const accepted=[[shot('已完成','B1')]],draft={story:'original',model:'model',screenplay:{content:parts.join('\n')},prepared:{},segments:parts.map(text=>({text})),parts:accepted};let writes=[],requests=[];
 await require('./act-generation').run('original','model',draft,{save:s=>writes.push(s),notice(){},split(){throw Error('Do not resplit saved segments')},prepare(){throw Error('Do not recreate assets')},makeShots:rows=>rows.map((s,i)=>({id:String(i),prompt:'ready',dur:4})),validPrompt:()=>true,request:async(url,body)=>{requests.push(body);assert.equal(url,'/api/storyboard');return {shots:[shot('新镜头','B1')]}}});
 assert.deepEqual(requests.map(r=>r.segmentContext.index),[1,2]);assert.deepEqual(requests[0].segmentContext.segments,parts);assert.deepEqual(writes.at(-1).parts[0],accepted[0]);
});
