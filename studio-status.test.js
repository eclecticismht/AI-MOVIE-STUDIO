const {test}=require('node:test'),assert=require('node:assert/strict');
const {diagnostics}=require('./studio-status-api');
const fs=require('node:fs'),vm=require('node:vm');
test('offline model discovery is unknown, not an installed-model failure',async()=>{
 const result=await diagnostics(async()=>{throw Error('offline')});
 assert.equal(result.ready,false);assert.equal(result.renderer,false);assert.equal(result.modelCheck,'unavailable');assert.deepEqual(result.missing,[]);
 assert.ok(result.timelineOutputResolutions.includes('2560x1440'));
});
test('cockpit and render workspace show the same live renderer status',async()=>{
 const nodes={nodeStatus:{},cockpitNodeStatus:{}},context=vm.createContext({D:{masters:[],projects:[]},document:{getElementById:id=>nodes[id]},renderStudio(){},renderSettings(){},renderCockpit(){},setInterval(){},AbortSignal:{timeout:()=>0},fetch:async()=>({ok:true,json:async()=>({renderer:true,running:0,queued:0,missing:[],masters:[]})})});
 vm.runInContext(fs.readFileSync('studio-status-ui.js','utf8'),context);
 await new Promise(resolve=>setImmediate(resolve));
 vm.runInContext('renderCockpit()',context);
 assert.match(nodes.cockpitNodeStatus.textContent,/渲染器已连接/);assert.equal(nodes.cockpitNodeStatus.textContent,nodes.nodeStatus.textContent);
});
