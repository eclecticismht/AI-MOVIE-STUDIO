const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function app(value){let mode=value,payload;const panel={};const ctx=vm.createContext({D:{activeProjectId:'p',projects:[{id:'p'}],characters:[],shots:[{id:'s',projectId:'p',script:'穿上棉袄',visual:'床边'}]},editingShotId:'s',renderShots2(){mode='strict'},saveStoryboardShot:()=>true,document:{getElementById:id=>id==='localFrameReferenceMode'?{value:mode}:id==='localFrameStatus'?panel:null},shotReferenceAssets:()=>[{imageUrl:'/assets/example.png'}],uploadShotImages:async()=>[{file:'image.png'}],fetch:async(url,options)=>{payload=JSON.parse(options.body);return {ok:false,json:async()=>({error:'stopped test request'})}}});vm.runInContext(fs.readFileSync('first-frame-ui.js','utf8'),ctx);return {run:s=>vm.runInContext(s,ctx),payload:()=>payload}}
test('reference changes are opt-in and missing or unknown choices keep strict defaults',()=>{
 for(const value of [undefined,'strict','other'])assert.equal(app(value).run('localFrameReferenceOptions().referencePolicy'),'strict');
 assert.equal(app('adapt').run('localFrameReferenceOptions().referenceStrength'),1);
});
test('generation preserves the explicit selected mode across editor save and rerender',async()=>{
 const a=app('adapt');await a.run('generateLocalFirstFrame()');assert.equal(a.payload().referencePolicy,'adapt');assert.equal(a.payload().referenceStrength,1);
});