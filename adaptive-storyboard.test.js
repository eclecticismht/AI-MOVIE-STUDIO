const {test}=require('node:test'),assert=require('node:assert/strict'),Segments=require('./storyboard-segments'),{run}=require('./act-generation');
const text='第1场 外景·操场·日\n\n'+['甲'.repeat(100),'乙'.repeat(100),'丙'.repeat(100),'丁'.repeat(100)].join('\n\n');
test('adaptive segmentation preserves all paragraphs and scene heading, with bounded recursion',()=>{
 const parts=Segments.bisect({text,timing:{mode:'auto'}});assert.equal(parts.length,2);assert.ok(parts.every(p=>p.text.startsWith('第1场 外景·操场·日')));
 for(const char of ['甲','乙','丙','丁'])assert.equal(parts.map(p=>p.text).join('').split(char).length-1,100);
 assert.deepEqual(Segments.bisect({text,depth:4}),[]);assert.deepEqual(Segments.bisect({text:'一镜到底\n'+text}),[]);
});
test('length limit splits only unfinished segment and resumes without repeating accepted shots',async()=>{
 const first={text:'已完成的镜头'},draft={story:'story',model:'model',screenplay:{content:text},prepared:{},segments:[first,{text}],parts:[[{action:'already done'}]]};let saved,calls=0;
 const out=await run('story','model',draft,{save:s=>saved=s,notice(){},split(){throw Error('Saved segmentation must be reused')},prepare(){throw Error('Already prepared')},makeShots:raw=>raw.map((s,i)=>({id:'s'+i,dur:4,prompt:'ready'})),describe:()=>'',validPrompt:()=>true,request:async(url,body)=>{
  assert.equal(url,'/api/storyboard');calls++;assert.notEqual(body.screenplay,first.text);if(body.screenplay===text)throw Object.assign(Error('length'),{code:'MODEL_OUTPUT_LIMIT'});return {shots:[{action:'new'}]};
 }});
 assert.equal(calls,3);assert.equal(out.shots.length,3);assert.deepEqual(out.parts[0],[{action:'already done'}]);assert.equal(saved.outputLimits.length,1);
});
test('explicit continuous shot is never silently split to work around output limits',async()=>{
 const story='一镜到底，保持连续运镜',draft={story,model:'m',screenplay:{content:text},prepared:{}};let saved;
 await assert.rejects(run(story,'m',draft,{save:s=>saved=s,notice(){},split:()=>[{text}],request:async()=>{throw Object.assign(Error('length'),{code:'MODEL_OUTPUT_LIMIT'})}}),/length/);
 assert.equal(saved.segments.length,1);
});