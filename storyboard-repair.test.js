const {test}=require('node:test'),assert=require('node:assert/strict'),{merge}=require('./storyboard-repair');
test('targeted repair preserves unmodified rows and original order when splitting a failed shot',()=>{
 const source={shots:[{action:'开门前'},{action:'过长的两个动作'},{action:'后镜'}]},repair={content:JSON.stringify(source)};
 const result=JSON.parse(merge(JSON.stringify({corrections:[{index:2,shots:[{action:'动作一'},{action:'动作二'}]}]}),repair));assert.deepEqual(result.shots,[source.shots[0],{action:'动作一'},{action:'动作二'},source.shots[2]]);assert.equal(source.shots.length,3);
 for(const index of [0,4,1.1])assert.throws(()=>merge(JSON.stringify({corrections:[{index,shots:[{}]}]}),repair),/无效/);
 assert.throws(()=>merge(JSON.stringify({corrections:[{index:1,shots:[{}]},{index:1,shots:[{}]}]}),repair),/无效/);
});
