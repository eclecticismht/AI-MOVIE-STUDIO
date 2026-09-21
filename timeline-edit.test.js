const {test}=require('node:test'),assert=require('node:assert/strict'),Edit=require('./timeline-edit');
const shots=[{id:'a',sequence:1,dur:5},{id:'b',sequence:2,dur:6}];
test('trim/reorder/overlap are non-destructive and use one preview/export duration',()=>{
 const before=JSON.stringify(shots),edit={order:['b','a'],clips:{b:{trimIn:1,trimOut:4,transition:'dissolve',transitionDuration:.5},a:{trimIn:.5,trimOut:3}}},c=Edit.build(shots,edit);
 assert.deepEqual(c.map(c=>[c.shot.id,c.start,c.end]),[['b',0,3],['a',2.5,5]]);assert.equal(Edit.active(c,2.75).length,2);assert.equal(Edit.graph(c).duration,5);assert.equal(JSON.stringify(shots),before);assert.match(Edit.graph(c).filters.join(';'),/offset=2.5/);
});
test('reject invalid trims gains and transitions rather than silently changing edits',()=>{
 for(const edit of [{trimIn:4,trimOut:3},{trimOut:7},{gain:2},{gain:NaN},{transition:'arbitrary-filter'},{transition:'dissolve',transitionDuration:8}])assert.throws(()=>Edit.entry(shots[0],edit));
 assert.throws(()=>Edit.build(shots,{clips:{a:{trimOut:1,transition:'dissolve',transitionDuration:1}}}),/一半/);
 assert.throws(()=>Edit.mix({master:2}));
});
test('deleted/archived shots are excluded while newly generated shots append',()=>{
 assert.deepEqual(Edit.build([...shots,{id:'archived',dur:5,autoArchived:true}],{order:['gone','b','b','archived']}).map(c=>c.shot.id),['b','a']);
});
test('export sources cannot access arbitrary network or filesystem locations',()=>{
 const {sourceLocation}=require('./timeline-export-api');
 for(const url of ['https://example.com/video.mp4','file:///C:/secret','http://127.0.0.1:8188/view?filename=x.mp4&subfolder=../private','http://127.0.0.1:8188/view?filename=x.mp4&type=input','http://127.0.0.1:4173/connector-queue.json'])assert.throws(()=>sourceLocation(url));
 assert.ok(sourceLocation('http://127.0.0.1:8188/view?filename=test.mp4&type=output').url);
});
test('edit persistence merges current project only and refuses a stale concurrent edit',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),data={activeProjectId:'p',projects:[{id:'p',storyboardBatchId:'batch'},{id:'other'}],shots:shots.map(s=>({...s,projectId:'p',storyboardBatchId:'batch'}))};
 let stored=JSON.stringify(data),notice='';const context=vm.createContext({D:data,TimelineEdit:Edit,structuredClone,activeProject:()=>data.projects[0],tlMessage:m=>notice=m,tlMount(){},tlInspector(){},tlMedia(){},tlTools(){},go(){},window:{addEventListener(){}},localStorage:{getItem:()=>stored,setItem:(key,value)=>stored=value}});
 vm.runInContext(fs.readFileSync('timeline-edit-ui.js','utf8'),context);
 const original=JSON.stringify(data.shots);assert.equal(vm.runInContext("cutPatch('a',{trimIn:1})",context),true);assert.equal(JSON.stringify(data.shots),original);assert.equal(JSON.parse(stored).projects[0].timelineEdits.batch.clips.a.trimIn,1);
 const newer=JSON.parse(stored);newer.projects[0].timelineEdits.batch.clips.a.trimIn=2;stored=JSON.stringify(newer);
 assert.equal(vm.runInContext("cutPatch('a',{trimIn:0})",context),false);assert.equal(JSON.parse(stored).projects[0].timelineEdits.batch.clips.a.trimIn,2);assert.match(notice,/其他页面/);
});
