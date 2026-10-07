const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const C=require('./voice-casting'),P=require('./performance-audio'),D=require('./dialogue-contract');
const file='ams-audio-'+'a'.repeat(64)+'.wav',events=[{type:'speech',speakerId:'waitress',speakerName:'服务员',delivery:'onscreen',text:'都在酒里了。'}],shot={id:'s',projectId:'p',voiceProfileId:'warm',dialogue:'服务员：都在酒里了。',sourceExcerpt:'服务员：都在酒里了。'},asset={id:'a',projectId:'p',audioUrl:'/audio-assets/'+file,speakerId:'waitress',voiceProfileId:'warm'};
const data={shots:[shot],characters:[{id:'waitress',projectId:'p',name:'服务员'}],audio:[asset]};
test('known role and voice profile match without confusing image position with the speaker',()=>{assert.equal(C.inspect(data,shot,file,events).status,'compatible');assert.equal(C.inspect(data,shot,file,[{...events[0],delivery:'offscreen'}]).status,'compatible')});
test('wrong roles, conflicting metadata and incompatible voice versions stop selection',()=>{
 for(const patch of [{speakerId:'man'},{voiceProfileId:'teenager'}])assert.throws(()=>C.assertSelection({...data,audio:[{...asset,...patch}]},shot,file,events),/角色|音色/);
 assert.throws(()=>C.assertSelection({...data,audio:[asset,{...asset,id:'b',speakerId:'man'}]},shot,file,events),/角色/);
});
test('legacy untagged recordings are explicitly unverified, not silently approved or blocked',()=>{assert.equal(C.inspect({...data,audio:[{...asset,speakerId:undefined}]},shot,file,events).status,'unverified');assert.equal(C.inspect({...data,audio:[]},shot,file,events).status,'unverified')});
test('other projects cannot supply matching-role verification',()=>{assert.equal(C.inspect({...data,audio:[{...asset,projectId:'other'}]},shot,file,events).status,'unverified')});
test('no dialogue or multiple speakers never count as a verified single-speaker recording',()=>{assert.throws(()=>C.assertSelection(data,shot,file,[]),/说话人/);assert.throws(()=>C.assertSelection(data,shot,file,[...events,{...events[0],speakerId:'man'}]),/说话人/)});
test('bound file is checked against original recording metadata, not just padded output',()=>{assert.throws(()=>C.checkBound({...data,audio:[{...asset,speakerId:'man'}]},{...shot,performanceAudio:{source:{file}}},events),/角色/)});
test('server rejects stale or foreign shot context without modifying workspace',()=>{
 const input={projectId:'p',shotId:'s',file,dialogueEvents:events},before=JSON.stringify(data);assert.equal(P.verifyCasting(input,data).status,'compatible');
 assert.throws(()=>P.verifyCasting({...input,dialogueEvents:[{...events[0],text:'换词了。'}]},data),/对白已改变/);
 assert.throws(()=>P.verifyCasting({...input,projectId:'other'},data),/不存在/);assert.equal(JSON.stringify(data),before);
});
test('saved first-frame URLs use editor validation in production preflight; upload remains separate',()=>{
 const binding={version:1,file,sha256:'a'.repeat(64),duration:5,frames:124,speechKey:require('./performance-audio-contract').speechKey(events)};
 const s={...shot,dur:5,firstFrameUrl:'/assets/frame.png',firstFrameSpeakerPosition:'center',performanceAudio:binding};
 const context=vm.createContext({D:{...data,shots:[s]},DialogueContract:D,PerformanceAudio:require('./performance-audio-contract'),VoiceCasting:C,storyboardAssetSummary:()=>''});
 vm.runInContext(fs.readFileSync('asset-reference-ui.js','utf8'),context);context.shot=s;assert.equal(vm.runInContext('shotDialogueEvents(shot)[0].speakerId',context),'waitress');
 delete s.firstFrameSpeakerPosition;assert.throws(()=>vm.runInContext('shotDialogueEvents(shot)',context),/说话人/);
});

test('same role and voice version still reject a recording registered with different words',()=>{assert.throws(()=>C.assertSelection({...data,audio:[{...asset,transcript:'没有过不去的坎。'}]},shot,file,events),/台词/)});
test('a registered full take may contain the exact current excerpt without rewriting either',()=>{const full={...asset,transcript:'不如意事常八九，可与人言无二三，都在酒里了。'},source={...data,audio:[full]},before=JSON.stringify(source);assert.equal(C.inspect(source,shot,file,events).status,'compatible');assert.equal(JSON.stringify(source),before);assert.equal(C.inspect({...data,audio:[{...asset,transcript:'都在酒里了！'}]},shot,file,events).status,'compatible')});
test('missing old transcript does not invent an exact-word claim',()=>{assert.equal(C.inspect(data,shot,file,events).status,'compatible');assert.throws(()=>C.assertSelection({...data,audio:[{...asset,transcript:'都在茶里了。'}]},shot,file,events),/台词/)});
test('server applies the registered transcript check as well as the current dialog key',()=>{assert.throws(()=>P.verifyCasting({projectId:'p',shotId:'s',file,dialogueEvents:events},{...data,audio:[{...asset,transcript:'祝你生日快乐。'}]}),/台词/)});
