const {test}=require('node:test'),assert=require('node:assert/strict');
const {clips,at,versions,timecode}=require('./timeline-model');
test('timeline orders by sequence without changing stored shots and preserves exact durations',()=>{
  const shots=[{id:'b',sequence:2,dur:5.5},{id:'a',sequence:1,dur:4},{id:'old',sequence:0,dur:9,autoArchived:true}],before=JSON.stringify(shots),result=clips(shots);
  assert.deepEqual(result.map(c=>[c.shot.id,c.start,c.end]),[['a',0,4],['b',4,9.5]]);assert.equal(JSON.stringify(shots),before);
  assert.equal(at(result,4).shot.id,'b');assert.equal(at(result,9.5).shot.id,'b');assert.equal(at([],0),undefined);
});
test('timeline versions never mix matching shot IDs from different projects',()=>{
  const data={generations:[{id:'other',projectId:'q',shot:'s',videoUrl:'other.mp4'},{id:'old',projectId:'p',shot:'s',videoUrl:'old.mp4'},{id:'new',projectId:'p',shot:'s',videoUrl:'new.mp4'},{id:'missing',projectId:'p',shot:'s'}]};
  assert.deepEqual(versions(data,{id:'s',projectId:'p'}).map(v=>v.id),['new','old']);
});
test('timecode is stable at minute boundaries',()=>{assert.equal(timecode(59.9),'00:59');assert.equal(timecode(60),'01:00');assert.equal(timecode(0),'00:00')});
