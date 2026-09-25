const test=require('node:test'),assert=require('node:assert/strict');
const {submit}=require('./connector-submission');

test('lost acknowledgement recovers the accepted task after restart without a second submission',async()=>{
 let disk,accepted=0,remote,graphCalls=0;
 const job={id:'shot-a'},persist=()=>disk=JSON.stringify(job);
 const request=async(route,options)=>{
  if(route==='/prompt'){accepted++;const body=JSON.parse(options.body);remote=[1,'remote-one',body.prompt,body.extra_data,[]];throw Error('response lost')}
  return route==='/queue'?{queue_running:[remote],queue_pending:[]} : {};
 };
 await assert.rejects(()=>submit(job,{request,persist,graph:()=>({seed:++graphCalls})}),/lost/);
 const restarted=JSON.parse(disk);assert.equal(restarted.submissionPending,true);
 const result=await submit(restarted,{request,persist:()=>{},graph:()=>{throw Error('must reuse graph')}});
 assert.equal(result.prompt_id,'remote-one');assert.equal(accepted,1);assert.equal(graphCalls,1);
});

test('an uncertain submission is never resent just because queue and history are empty',async()=>{
 const job={id:'a',submissionPending:true,submissionId:'persisted'};let posts=0;
 const request=async(route)=>{if(route==='/prompt')posts++;return route==='/queue'?{queue_running:[],queue_pending:[]}: {}};
 await assert.rejects(()=>submit(job,{request,persist:()=>{},graph:()=>({})}),/阻止重复/);assert.equal(posts,0);
});

test('a definite validation rejection permits a corrected retry and execution graph stays reproducible',async()=>{
 const job={id:'a'};let attempts=0,graphs=0;
 const io={persist(){},graph(){graphs++;return {seed:42}},request:async()=>{if(!attempts++)throw Object.assign(Error('invalid workflow'),{upstreamRejected:true});return {prompt_id:'ok'}}};
 await assert.rejects(()=>submit(job,io),/invalid/);assert.equal(job.submissionPending,false);
 assert.equal((await submit(job,io)).prompt_id,'ok');assert.equal(graphs,1);assert.equal(job.executionGraph.seed,42);
});
