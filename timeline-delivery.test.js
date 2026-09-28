const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const Export=require('./timeline-export-api');
const clip={shotId:'s',url:'/assets/imported/asset-'+ 'a'.repeat(64)+'.mp4',sourceDuration:2,trimIn:0,trimOut:2};

test('legacy requests remain playback-only; unsupported delivery modes fail before writes',()=>{
 const legacy=Export.validate({projectId:'p',clips:[clip]});assert.equal(legacy.deliveryMode,'review');
 const bundle=Export.validate({projectId:'p',clips:[clip],outputResolution:'2560x1440',deliveryMode:'master_and_review'});
 assert.equal(bundle.deliveryMode,'master_and_review');
 assert.ok(Export.requiredExportBytes(bundle)>Export.requiredExportBytes({...bundle,deliveryMode:'review'}));
 assert.throws(()=>Export.validate({projectId:'p',clips:[clip],deliveryMode:'unsupported'}),/播放版/);
});

test('a delayed capability response cannot overwrite the current project selection',async()=>{
 const pending=[];
 const context=vm.createContext({D:{activeProjectId:'p'},activeProject:()=>({}),tlMessage(){},tlMount(){},tlTools(){},tlInspector(){},tlMedia(){},tlTracks(){},tlPreview(){},tlSelect(){},tlSeek(){},tlPlay(){},go(){},window:{addEventListener(){}},document:{querySelectorAll:()=>[]},AbortSignal,fetch:()=>new Promise(resolve=>pending.push(resolve))});
 vm.runInContext(fs.readFileSync('timeline-edit-ui.js','utf8'),context);
 const first=vm.runInContext('cutLoadOutputProfiles()',context);
 context.D.activeProjectId='q';const second=vm.runInContext('cutLoadOutputProfiles()',context);
 pending[1]({ok:true,json:async()=>({outputResolutions:['1280x720'],deliveryModes:['review']})});await second;
 pending[0]({ok:true,json:async()=>({outputResolutions:['2560x1440'],deliveryModes:['review','master_and_review']})});await first;
 assert.equal(vm.runInContext('CUT.outputProfilesProjectId',context),'q');assert.equal(vm.runInContext('CUT.outputProfiles.join()',context),'1280x720');assert.equal(vm.runInContext('CUT.deliveryModes.join()',context),'review');
});

test('a completed bundle missing its master is not listed as complete; legacy MP4 still works',()=>{
 const root=path.resolve('bundle-list-test'),id='cut_'+'a'.repeat(16);
 const run={status:'complete',duration:2,plan:{projectId:'p',clips:[clip],deliveryMode:'master_and_review'}};
 const io={existsSync:file=>path.basename(file)!=='master.mov',readdirSync:()=>[id],readFileSync:()=>JSON.stringify(run)};
 assert.equal(Export.listExports('p',root,io).length,0);
 io.existsSync=()=>true;
 assert.equal(Export.listExports('p',root,io)[0].masterUrl,'/timeline-exports/'+id+'/master.mov');
 delete run.plan.deliveryMode;io.existsSync=file=>path.basename(file)!=='master.mov';
 assert.equal(Export.listExports('p',root,io)[0].masterUrl,undefined);
});

test('delivery selection is scoped to the project and waits for service capability',()=>{
 const p={id:'p'},q={id:'q',timelineDeliveryMode:'review'};let data=JSON.stringify({projects:[p,q]}),message='';
 const context=vm.createContext({D:{activeProjectId:'p'},activeProject:()=>p,tlMessage:s=>message=s,tlMount(){},tlTools(){},tlInspector(){},tlMedia(){},tlTracks(){},tlPreview(){},tlSelect(){},tlSeek(){},tlPlay(){},go(){},window:{addEventListener(){}},localStorage:{getItem:()=>data,setItem:(key,value)=>data=value}});
 vm.runInContext(fs.readFileSync('timeline-edit-ui.js','utf8'),context);
 vm.runInContext("cutSetDeliveryMode('master_and_review')",context);assert.equal(p.timelineDeliveryMode,undefined);assert.match(message,/尚未确认/);
 vm.runInContext("CUT.deliveryModes=['review','master_and_review'];cutSetDeliveryMode('master_and_review')",context);
 assert.equal(JSON.parse(data).projects[0].timelineDeliveryMode,'master_and_review');assert.equal(JSON.parse(data).projects[1].timelineDeliveryMode,'review');
});
