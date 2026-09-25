const {test}=require('node:test'),assert=require('node:assert/strict'),Backup=require('./project-backup'),vm=require('node:vm'),fs=require('node:fs');
function data(){const d={projects:[{id:'p',name:'测试'}],activeProjectId:'p'};for(const k of ['shots','jobs','generations','masters','audio','characters','scenes','props','scripts'])d[k]=[];return d;}
test('backup roundtrip preserves creative content but strips credentials',()=>{
 const d=data();d.shots.push({id:'s',projectId:'p',prompt:'保留故事',assetStates:{x:{screenText:'603.72'}}});d.connector={endpoint:'http://local',apiKey:'secret'};
 const out=Backup.decode(Backup.encode(d));assert.deepEqual(out.shots,d.shots);assert.equal(out.connector.apiKey,undefined);assert.equal(d.connector.apiKey,'secret');
});
test('restore rejects malformed data, duplicate identities and foreign projects',()=>{
 for(const change of [d=>d.shots=null,d=>d.projects.push({id:'p'}),d=>d.shots.push({id:'s',projectId:'missing'}),d=>d.activeProjectId='missing']){const d=data();change(d);assert.throws(()=>Backup.decode(Backup.encode(d)));}
 assert.throws(()=>Backup.decode('{bad'));assert.throws(()=>Backup.decode('{}'));
});
test('restore storage failure leaves active data unchanged; active production blocks restore',async()=>{
 for(const busy of [false,true]){
  let restores=0;const original=data(),pending=data(),ctx={D:original,pendingProjectBackup:pending,workspaceRestore:async()=>{restores++;throw Error('disk full')},confirm:()=>true,ProjectBackup:Backup,AbortSignal,document:{getElementById:()=>({})},fetch:async()=>({ok:true,json:async()=>({runs:busy?[{status:'rendering'}]:[]})}),location:{reload(){throw Error('unexpected reload')}}};
  vm.createContext(ctx);const s=fs.readFileSync('project-backup-ui.js','utf8');vm.runInContext(s.slice(s.indexOf('async function restoreProjectBackup'),s.indexOf('const settingsBeforeBackup')),ctx);await vm.runInContext('restoreProjectBackup()',ctx);assert.equal(ctx.D,original);assert.equal(ctx.pendingProjectBackup,pending);assert.equal(restores,busy?0:1);
 }
});
