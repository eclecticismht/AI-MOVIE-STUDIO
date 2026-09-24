const test=require('node:test'),assert=require('node:assert/strict');
const {batchRetryPlan,retryPlan}=require('./film-api');
const file=c=>'ams-ref-'+c.repeat(64)+'.png';
const shot=()=>({shotId:'s',prompt:'Ride to a restaurant.',duration:5,width:864,height:480,subtitle:'',dialogueEvents:[],references:[{assetId:'man',kind:'characters',name:'西门清',file:file('a')},{assetId:'street',kind:'scenes',name:'Street',file:file('b')}],ready:true,sourceFingerprint:'f'.repeat(64)});
const parent=()=>({id:'old',projectId:'p',title:'t',status:'paused',shots:[shot(),{...shot(),shotId:'s2'}]});
const revision=()=>({prompt:'Same man wearing his gray T-shirt.',duration:5,subtitle:'',characterReferenceFiles:{man:file('c')}});
test('wardrobe repair replaces only selected character images and preserves parent footage',()=>{
 const p=parent(),child=batchRetryPlan(p,[{index:0,revision:revision()}]);
 assert.equal(child.shots[0].references[0].file,file('c'));
 assert.equal(child.shots[0].references[1].file,file('b'));
 assert.equal(child.shots[0].ready,false);assert.equal(child.shots[1].ready,true);
 assert.equal(child.shots[0].sourceFingerprint,undefined);
 assert.equal(p.shots[0].references[0].file,file('a'));assert.equal(p.shots[0].sourceFingerprint,'f'.repeat(64));
});
test('wardrobe repair rejects unknown assets, scene replacements and unsafe filenames',()=>{
 for(const files of [null,[],{}, {missing:file('c')},{street:file('c')},{man:'../private.png'}])assert.throws(()=>retryPlan(parent(),0,{...revision(),characterReferenceFiles:files}));
});
test('wardrobe repair cannot silently retain an incompatible first frame or continuity frame',()=>{
 const p=parent();p.shots[0].firstFrame={file:file('d')};
 assert.throws(()=>retryPlan(p,0,revision()),/首帧/);
 assert.throws(()=>retryPlan(p,0,{...revision(),firstFrame:p.shots[0].firstFrame}),/首帧/);
 assert.equal(retryPlan(p,0,{...revision(),firstFrame:null}).shots[0].firstFrame,undefined);
 assert.equal(retryPlan(p,0,{...revision(),firstFrame:{file:file('e')}}).shots[0].firstFrame.file,file('e'));
 delete p.shots[0].firstFrame;p.shots[0].continueFromShotId='prior';
 assert.throws(()=>retryPlan(p,0,revision()),/前镜/);
});

