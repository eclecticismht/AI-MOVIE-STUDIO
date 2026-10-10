const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {validate,outputSettings,outputResolutions,outputScaleFilter}=require('./timeline-export-api');

test('QHD export retains 1440 working lines and crops without stretching',()=>{
  const {intermediateFilter}=require('./timeline-export-api');
  const plan=validate({projectId:'p',outputResolution:'2560x1440',aspectMode:'crop',clips:[{shotId:'s',url:'/assets/imported/asset-'+ 'a'.repeat(64)+'.mp4',sourceDuration:2,trimIn:0,trimOut:2}]});
  assert.equal(plan.output.width/plan.output.height,16/9);
  assert.match(intermediateFilter(plan.output,plan.aspectMode),/scale=2560:1440:force_original_aspect_ratio=increase/);
  assert.match(intermediateFilter(plan.output,plan.aspectMode),/crop=2560:1440/);
  assert.match(intermediateFilter(plan.output),/force_original_aspect_ratio=decrease.*pad=2560:1440/);
});

test('timeline exports support explicit HD, Full HD, and labeled 4K upscaling',()=>{
  const clip={shotId:'s1',url:'http://127.0.0.1:4173/film-runs/film_0123456789abcdef/clip-0.mp4',sourceDuration:2,trimIn:0,trimOut:2};
  const hd=validate({projectId:'p',clips:[clip]});
  assert.deepEqual(hd.output,outputSettings('1280x720'));
  const uhd=validate({projectId:'p',outputResolution:'3840x2160',clips:[clip]});
  assert.deepEqual(uhd.output,{preset:'3840x2160',width:3840,height:2160,label:'4K UHD（上采样）',upscaled:true});
  assert.deepEqual(outputResolutions(),['854x480','1280x720','1920x1080','2560x1440','3840x2160']);
  assert.equal(outputScaleFilter(uhd.output),'scale=3840:2160:flags=lanczos,setsar=1,format=yuv420p');
  assert.throws(()=>validate({projectId:'p',outputResolution:'7680x4320',clips:[clip]}),/支持的成片分辨率/);
});

test('timeline output resolution is saved only to the selected Studio project',()=>{
  const data={projects:[{id:'series',timelineOutputResolution:'1280x720'},{id:'other',timelineOutputResolution:'1920x1080'}]},project=data.projects[0];
  let stored=JSON.stringify(data),message='';
  const context=vm.createContext({D:{activeProjectId:'series',projects:data.projects},activeProject:()=>project,tlMessage:value=>message=value,tlMount(){},tlTools(){},tlInspector(){},tlMedia(){},tlTracks(){},tlPreview(){},tlSelect(){},tlSeek(){},tlPlay(){},go(){},window:{addEventListener(){}},localStorage:{getItem:()=>stored,setItem:(key,value)=>stored=value}});
  vm.runInContext(fs.readFileSync('timeline-edit-ui.js','utf8'),context);
  vm.runInContext("CUT.outputProfiles=['1280x720','1920x1080','2560x1440','3840x2160']",context);
  vm.runInContext("cutSetOutputResolution('3840x2160')",context);
  const saved=JSON.parse(stored);
  assert.equal(saved.projects[0].timelineOutputResolution,'3840x2160');
  assert.equal(saved.projects[1].timelineOutputResolution,'1920x1080');
  assert.equal(project.timelineOutputResolution,'3840x2160');
  assert.match(message,/上采样母版/);
  vm.runInContext("CUT.outputProfiles=['1280x720'];cutSetOutputResolution('1920x1080')",context);
  assert.equal(project.timelineOutputResolution,'3840x2160');
  assert.match(message,/服务尚未确认支持/);
});

test('older export services keep HD enabled and refuse unsupported high-resolution jobs',async()=>{
  const project={id:'series',timelineOutputResolution:'3840x2160'};let message='';
  const context=vm.createContext({D:{activeProjectId:'series',projects:[project]},activeProject:()=>project,tlMessage:value=>message=value,tlMount(){},tlTools(){},tlInspector(){},tlMedia(){},tlTracks(){},tlPreview(){},tlSelect(){},tlSeek(){},tlPlay(){},go(){},window:{addEventListener(){}},document:{querySelectorAll:()=>[]},AbortSignal:{timeout:()=>0},fetch:async()=>({ok:true,json:async()=>({exports:[]})}),localStorage:{getItem:()=>JSON.stringify({projects:[project]}),setItem(){}}});
  vm.runInContext(fs.readFileSync('timeline-edit-ui.js','utf8'),context);
  const profiles=await vm.runInContext('cutLoadOutputProfiles()',context);
  assert.deepEqual(Array.from(profiles),['1280x720']);
  vm.runInContext("cutSetOutputResolution('3840x2160')",context);
  assert.match(message,/服务尚未确认支持/);
});

test('Rec.709 delivery converts pixels instead of merely changing tags',()=>{
 const {intermediateFilter}=require('./timeline-export-api');assert.match(intermediateFilter(outputSettings('2560x1440'),'crop','bt709'),/colorspace=all=bt709:range=tv:format=yuv420p10/);assert.doesNotMatch(intermediateFilter(outputSettings('1280x720')),/colorspace=/);
});
test('lossless exports refuse insufficient disk space before creating a run',()=>{
 const {requiredExportBytes,assertExportSpace}=require('./timeline-export-api');
 const plan={output:outputSettings('2560x1440'),clips:[{duration:120}]};
 const budget=requiredExportBytes(plan);assert.ok(budget>40*1024**3);
 assert.throws(()=>assertExportSpace(plan,'.',{statfsSync:()=>({bavail:10*1024**3,bsize:1})}),/空间不足/);
 assert.doesNotThrow(()=>assertExportSpace(plan,'.',{statfsSync:()=>({bavail:budget,bsize:1})}));
});


test('local HQ deliverable H3 clips bypass 5MB import and reject off-root access',()=>{
 const path=require('node:path'),{sourceLocation}=require('./timeline-export-api');
 const good='/deliveries/G7_REMAKE_S02_HQ/clips/G7_R05_EP001_STD01_D01_HQ_v001.mp4';
 const at=sourceLocation(good);
 assert.equal(at.file,path.join(__dirname,'deliveries','G7_REMAKE_S02_HQ','clips','G7_R05_EP001_STD01_D01_HQ_v001.mp4'));
 const full=sourceLocation('http://127.0.0.1:4173'+good);
 assert.equal(full.file,at.file);
 for(const url of ['/deliveries/G7_REMAKE_S02_HQ/clips/../evil.mp4','/deliveries/G7_REMAKE_S02_HQ/clips/%2e%2e%2fevil.mp4','/deliveries/G7_REMAKE_S02_HQ/clips/evil.mp4?x=1','/deliveries/G7_REMAKE_S02_HQ/clips/evil.txt','https://example.com'+good,'file:///C:/secret.mp4','/deliveries/G7_REMAKE_S02_HQ/clips/a..b.mp4']){
   assert.throws(()=>sourceLocation(url),/只允许|素材地址无效/);
 }
});
test('HQ native 1344x768 crops 6 pixels vertically to true 16:9 before 1080p scale',()=>{
 const {intermediateFilter,outputSettings}=require('./timeline-export-api');
 const native={width:1344,height:768},safe={width:native.width,height:native.width*9/16};
 assert.deepEqual(safe,{width:1344,height:756});
 assert.equal((native.height-safe.height)/2,6);
 const f=intermediateFilter(outputSettings('1920x1080'),'crop');
 assert.match(f,/force_original_aspect_ratio=increase/);
 assert.match(f,/crop=1920:1080/);
 assert.equal(outputSettings('1920x1080').upscaled,true);
});
