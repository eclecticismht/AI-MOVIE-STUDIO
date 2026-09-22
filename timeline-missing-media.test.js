const {test}=require('node:test'),assert=require('node:assert/strict'),{missingReason}=require('./timeline-model');
test('missing preview distinguishes deleted results from unsynced and ungenerated shots',()=>{
 const shot={id:'s',projectId:'p'},data={jobs:[{id:'j',shot:'s',projectId:'p',videoUrl:'movie.mp4'}]};
 assert.match(missingReason(data,shot),/同步结果/);
 data.deletedGenerationResults=[{jobId:'j',projectId:'p',videoUrl:'movie.mp4'}];assert.match(missingReason(data,shot),/已从审片中删除/);
 assert.match(missingReason(data,{id:'other',projectId:'p'}),/还没有可用视频/);
 assert.match(missingReason(data,{id:'s',projectId:'other'}),/还没有可用视频/);
});
