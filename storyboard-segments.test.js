const {test}=require('node:test'),assert=require('node:assert/strict'),{split}=require('./storyboard-segments');
test('scene segmentation preserves all content and distributes one film duration',()=>{
 const text='人物介绍\n第1场 外景·工地·日\n'+'动作。'.repeat(500)+'\n第2场 内景·家·夜\n'+'停顿。'.repeat(500),parts=split(text,{mode:'target',targetSeconds:480});
 assert.equal(parts.length,2);assert.equal(parts.map(p=>p.text).join('\n'),text);assert.equal(parts.reduce((n,p)=>n+p.timing.targetSeconds,0),480);assert.ok(parts.every(p=>p.timing.targetSeconds<480));
});
test('short scripts stay intact and auto timing is not forced into a fixed duration',()=>{
 assert.equal(split('短剧本',{mode:'auto'}).length,1);const text='第一场 外景\n'+'字'.repeat(2100)+'\n第二场 内景\n结尾';
 assert.ok(split(text,{mode:'auto'}).every(p=>p.timing.mode==='auto'));
});
