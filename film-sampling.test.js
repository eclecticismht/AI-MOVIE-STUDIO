const {test}=require('node:test'),assert=require('node:assert/strict'),{select}=require('./film-sampling');
test('sample selection preserves batch order and shot timing without modifying the original',()=>{
 const shots=[{id:'a',dur:8},{id:'b',dur:4},{id:'c',dur:12}];const picked=select(shots,['c','a']);
 assert.deepEqual(picked,[shots[0],shots[2]]);assert.equal(shots.length,3);assert.equal(picked[1].dur,12);
});
test('empty, foreign, duplicate and oversized samples never fall back to the full film',()=>{
 const shots=Array.from({length:13},(_,i)=>({id:String(i)}));
 for(const ids of [[],['foreign'],['1','1'],shots.map(s=>s.id)])assert.throws(()=>select(shots,ids));
});
