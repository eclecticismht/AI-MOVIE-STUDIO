const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {validate,outputSettings,outputScaleFilter}=require('./timeline-export-api');

test('timeline exports support explicit HD, Full HD, and labeled 4K upscaling',()=>{
  const clip={shotId:'s1',url:'http://127.0.0.1:4173/film-runs/film_0123456789abcdef/clip-0.mp4',sourceDuration:2,trimIn:0,trimOut:2};
  const hd=validate({projectId:'p',clips:[clip]});
  assert.deepEqual(hd.output,outputSettings('1280x720'));
  const uhd=validate({projectId:'p',outputResolution:'3840x2160',clips:[clip]});
  assert.deepEqual(uhd.output,{preset:'3840x2160',width:3840,height:2160,label:'4K UHD（上采样）',upscaled:true});
  assert.equal(outputScaleFilter(uhd.output),'scale=3840:2160:flags=lanczos,setsar=1,format=yuv420p');
  assert.throws(()=>validate({projectId:'p',outputResolution:'7680x4320',clips:[clip]}),/支持的成片分辨率/);
});

test('timeline output resolution is saved only to the selected Studio project',()=>{
  const data={projects:[{id:'series',timelineOutputResolution:'1280x720'},{id:'other',timelineOutputResolution:'1920x1080'}]},project=data.projects[0];
  let stored=JSON.stringify(data),message='';
  const context=vm.createContext({D:{activeProjectId:'series',projects:data.projects},activeProject:()=>project,tlMessage:value=>message=value,tlMount(){},tlTools(){},tlInspector(){},tlMedia(){},tlTracks(){},tlPreview(){},tlSelect(){},tlSeek(){},tlPlay(){},go(){},window:{addEventListener(){}},localStorage:{getItem:()=>stored,setItem:(key,value)=>stored=value}});
  vm.runInContext(fs.readFileSync('timeline-edit-ui.js','utf8'),context);
  vm.runInContext("cutSetOutputResolution('3840x2160')",context);
  const saved=JSON.parse(stored);
  assert.equal(saved.projects[0].timelineOutputResolution,'3840x2160');
  assert.equal(saved.projects[1].timelineOutputResolution,'1920x1080');
  assert.equal(project.timelineOutputResolution,'3840x2160');
  assert.match(message,/上采样母版/);
});
