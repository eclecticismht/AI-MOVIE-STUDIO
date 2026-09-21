const {test}=require('node:test'),assert=require('node:assert/strict'),{validateBottomCrop,cropFilter,compositionFile}=require('./film-framing');
test('framing validation bounds visible loss and chooses the derived clip only when enabled',()=>{
 for(const v of [-1,21,NaN,'10'])assert.throws(()=>validateBottomCrop(v));
 assert.equal(validateBottomCrop(),0);assert.match(cropFilter(15),/ih\*0\.85/);
 assert.equal(compositionFile({audioMode:'model'},1),'clip-1.mp4');assert.equal(compositionFile({audioMode:'replacement'},1),'sound-1.mp4');assert.equal(compositionFile({cropBottomPercent:15,audioMode:'replacement'},1),'framed-1.mp4');
});
test('partial framing recomposition keeps source identity and speech checks intact',()=>{
 const {recomposePlan}=require('./film-api');
 const parent={id:'p',projectId:'project',title:'t',status:'paused',shots:[{shotId:'s',ready:true,dialogueEvents:[],sourceExcerpt:'x',speechCheck:{status:'text_match'},jobId:'source-job'}]};
 const child=recomposePlan(parent,[{shotId:'s',cropBottomPercent:15}]);
 assert.equal(child.shots[0].cropBottomPercent,15);assert.equal(child.shots[0].jobId,'source-job');assert.equal(child.shots[0].speechCheck.status,'text_match');assert.equal(parent.shots[0].cropBottomPercent,undefined);
 assert.throws(()=>recomposePlan({...parent,shots:[{...parent.shots[0],ready:false}]},[{shotId:'s',cropBottomPercent:15}]),/已生成/);
});
