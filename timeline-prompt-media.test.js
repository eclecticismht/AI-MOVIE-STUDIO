const {test}=require('node:test'),assert=require('node:assert/strict'),Media=require('./timeline-prompt-media');
const photo={id:'a',type:'image',name:'photo',note:'构图',url:'/assets/imported/asset-'+'a'.repeat(64)+'.png'},video={id:'b',type:'video',name:'video',note:'动作',file:'ams-video-'+'b'.repeat(64)+'.mp4',url:'/assets/imported/ams-video-'+'b'.repeat(64)+'.mp4'};
test('prompt media retain visual usage and are counted alongside project references',()=>{
 assert.equal(Media.validate({},[photo,video],8).length,2);assert.throws(()=>Media.validate({},[photo],9),/9/);assert.throws(()=>Media.validate({},Array.from({length:4},(_,i)=>({...video,id:String(i)}))),/3/);
 const refs=Media.references({promptMedia:[photo,video]});assert.equal(refs[1].kind,'videos');assert.match(refs[1].notes,/动作/);assert.equal(refs[0].kind,'images');
});
test('conflicting input modes and nonlocal uploaded paths are rejected',()=>{
 for(const shot of [{firstFrameUrl:'frame'},{continueFromShotId:'previous'},{renderMode:'screen'}])assert.throws(()=>Media.validate(shot,[photo]),/同时使用/);
 assert.throws(()=>Media.validate({},[{...photo,url:'https://example.com/image.png'}]),/地址/);
 assert.throws(()=>Media.validate({},[{...video,file:'../private.mp4'}]),/地址/);
});
test('uploaded editing videos resolve only content-addressed local files',()=>{
 const {sourceLocation}=require('./timeline-export-api');assert.match(sourceLocation('/assets/imported/asset-'+'a'.repeat(64)+'.mp4').file,/imported/);
 assert.throws(()=>sourceLocation('/assets/imported/other.mp4'));assert.throws(()=>sourceLocation('https://example.com/assets/imported/asset-'+'a'.repeat(64)+'.mp4'));
});
