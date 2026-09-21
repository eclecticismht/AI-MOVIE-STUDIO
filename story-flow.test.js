const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const model=require('./story-flow-model'),ShotPrompt=require('./shot-prompt');
test('scene grouping uses screenplay headings, not inconsistent model scene labels',()=>{
  const source='第1场 外景·街道\n甲出门。\n乙跟上。\n第2场 内景·餐馆\n甲坐下。';
  const groups=model.groups([{scene:'街道',sourceExcerpt:'甲出门。'},{scene:'第一场街道',sourceExcerpt:'乙跟上。'},{scene:'餐馆',sourceExcerpt:'甲坐下。'}],source);
  assert.equal(groups.length,2);assert.equal(groups[0].shots.length,2);assert.equal(groups[1].index,2);
});
test('revisited places remain separate scene blocks and manual prompts are preserved',()=>{
  const shots=[{scene:'街道',prompt:'manual'},{scene:'餐馆',prompt:''},{scene:'街道',renderMode:'black'}];
  assert.equal(model.groups(shots).length,3);assert.deepEqual(model.pending(shots),[shots[1]]);
});
function harness(){
  const p={id:'p',name:'test',storyText:'故事'},D={activeProjectId:'p',projects:[p],scripts:[],shots:[],storyboardBatches:[]},calls={script:0,board:0,h3:0};
  const c={D,StoryFlowModel:model,ShotPrompt,activeProject:()=>p,renderScripts:()=>{},document:{getElementById:()=>null},localStorage:{setItem:()=>{}},screenplayRequests:new Set(),storyboardRequests:new Set(),screenplayMessages:new Map(),storyboardMessages:new Map(),screenplayApiKey:'',compileH3Prompt:()=>'',AbortSignal,console};
  c.generateScreenplay=async()=>{calls.script++;const s={id:'s',projectId:'p',content:'第1场 外景·街道\n走路。'};D.scripts.push(s);p.screenplayId=s.id;return s};
  c.generateStoryboard=async()=>{calls.board++;const b={id:'b',projectId:'p',sourceContent:D.scripts[0].content};D.storyboardBatches.push(b);D.shots.push({id:'sh',projectId:'p',storyboardBatchId:'b',dur:5,prompt:'',scene:'街道'});return b};
  c.fetch=async()=>{calls.h3++;return {ok:true,json:async()=>({prompts:[{id:'sh',prompt:'integrated_multimodal_description: [Shot 1] Walking.\noverall_soundscape: steps\nnon_diegetic_music: N/A'}]})}};
  vm.createContext(c);vm.runInContext(fs.readFileSync('story-flow-ui.js','utf8'),c);vm.runInContext('renderScripts=()=>{}',c);return {c,p,D,calls};
}
test('automatic workflow runs screenplay, storyboard and H3 in order, resume does not duplicate',async()=>{const {c,p,D,calls}=harness();await c.storyFlowStart();assert.equal(p.storyFlow.stage,'done');assert.ok(ShotPrompt.isStructured(D.shots[0].prompt));await c.storyFlowStart();assert.deepEqual(calls,{script:1,board:1,h3:1})});
test('H3 failure saves script and board; retry only resumes missing prompts',async()=>{const {c,p,calls}=harness(),fetch=c.fetch;c.fetch=async()=>({ok:false,json:async()=>({error:'offline'})});await c.storyFlowStart();assert.equal(p.storyFlow.stage,'prompts');c.fetch=fetch;await c.storyFlowStart();assert.equal(p.storyFlow.stage,'done');assert.equal(calls.script,1);assert.equal(calls.board,1)});
test('editing a shot while H3 is pending prevents overwriting manual work',async()=>{const {c,D,p}=harness(),fetch=c.fetch;c.fetch=async()=>{D.shots[0].prompt='manual';return fetch()};await c.storyFlowStart();assert.equal(D.shots[0].prompt,'manual');assert.equal(p.storyFlow.stage,'prompts')});
test('editing story during screenplay generation stops downstream calls',async()=>{const {c,p,D,calls}=harness(),make=c.generateScreenplay;c.generateScreenplay=async()=>{const s=await make();p.storyText='修改后的故事';return s};await c.storyFlowStart();assert.equal(D.scripts.length,1);assert.equal(calls.board,0)});
