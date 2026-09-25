const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {listExports}=require('./timeline-export-api');
test('completed exports survive refresh and remain scoped to their project',()=>{
  const root=path.resolve('exports-test'),ids=Array.from({length:6},(_,i)=>'cut_'+String(i).repeat(16));
  const run=(projectId,createdAt='2026-01-01')=>({status:'complete',duration:12,createdAt,plan:{projectId,title:'Scene',clips:[{},{}]}});
  const data=[run('p'),run('q'),{...run('p'),status:'rendering'},run('p'),null,run('p','2026-01-02')];
  const io={existsSync:file=>file===root||path.basename(path.dirname(file))!==ids[3],readdirSync:()=>[...ids,'unrelated'],readFileSync:file=>{
    const index=ids.indexOf(path.basename(path.dirname(file)));assert.notEqual(index,-1);
    return index===4?'invalid JSON':JSON.stringify(data[index]);
  }};
  const films=listExports('p',root,io);
  assert.deepEqual(films.map(f=>f.id),[ids[5],ids[0]]);
  assert.equal(films[0].clipCount,2);assert.equal(films[0].url,'/timeline-exports/'+ids[5]+'/movie.mp4');
  assert.equal(films[0].plan,undefined);assert.equal(listExports('q',root,io).length,1);
});
test('export listing requires a project and handles a new empty installation',()=>{
  assert.throws(()=>listExports(''),/项目/);assert.throws(()=>listExports(null),/项目/);
  assert.deepEqual(listExports('p','unused',{existsSync:()=>false}),[]);
});
