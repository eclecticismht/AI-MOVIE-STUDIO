const {test}=require('node:test'),assert=require('node:assert/strict');
const {filmReference,sourceShot,timelineAss}=require('./timeline-subtitles');
const clip=(changes={})=>({sourceDuration:6,trimIn:0,trimOut:6,duration:6,overlap:0,...changes});
const shot=(text='今天我40了，喝点。',start=1,end=5)=>({shotId:'s',duration:6,dialogueEvents:[{type:'speech',text}],subtitleTiming:{status:'aligned',cues:[{start,end,text}]}});
const events=result=>result.ass.split('\n').filter(line=>line.startsWith('Dialogue:'));

test('resolve captions only for local automatic-film clip sources',()=>{
 assert.deepEqual(filmReference('/api/film/film_ab12/preview?index=4'),{runId:'film_ab12',index:4});
 assert.deepEqual(filmReference('/film-runs/film_ab12/clip-3.mp4'),{runId:'film_ab12',index:3});
 for(const url of ['https://example.com/api/film/film_ab12/preview?index=4','file:///private/clip-4.mp4','http://x@127.0.0.1:4173/api/film/film_ab12/preview?index=4','/api/film/film_ab12/preview?index=-1','/film-runs/film_ab12/movie.mp4','/film-runs/film_ab12/clip-4.mp4#x','/assets/imported/asset.png'])assert.equal(filmReference(url),null);
});
test('caption lookup checks the shot identity without reading non-film sources',()=>{
 assert.equal(sourceShot({url:'/assets/imported/movie.mp4'},()=>{throw Error('unexpected read')}),null);
 const c={url:'/api/film/film_ab12/preview?index=0',shotId:'s'},s=shot();
 assert.equal(sourceShot(c,id=>{assert.equal(id,'film_ab12');return {shots:[s]}}),s);
 assert.throws(()=>sourceShot({...c,shotId:'other'},()=>({shots:[s]})),/不匹配/);
 assert.throws(()=>sourceShot(c,()=>({shots:[]})),/不匹配/);
});
test('trimmed captions shift with preceding shortened silent shots and keep original numerals',()=>{
 const source=shot(),before=JSON.stringify(source);
 const result=timelineAss([clip({trimOut:2,duration:2}),clip({trimIn:2,trimOut:4,duration:2})],[null,source]);
 assert.equal(result.cueCount,1);
 assert.match(events(result)[0],/^Dialogue: 0,0:00:02.00,0:00:04.00,.*今天我40了，喝点。$/);
 assert.equal(JSON.stringify(source),before);
});
test('captions outside retained source interval are omitted',()=>{
 const result=timelineAss([clip({trimIn:4,trimOut:6,duration:2})],[shot('已裁去',1,3)]);
 assert.equal(result.cueCount,0);assert.deepEqual(events(result),[]);
});
test('caption order follows reordered clips',()=>{
 const result=timelineAss([clip(),clip()],[shot('第二句'),shot('第一句')]);
 assert.match(events(result)[0],/0:00:01.00,0:00:05.00,.*第二句$/);
 assert.match(events(result)[1],/0:00:07.00,0:00:11.00,.*第一句$/);
});
test('transition overlap shifts time and switches caption text at the midpoint',()=>{
 const result=timelineAss([clip({trimOut:4,duration:4}),clip({trimOut:4,duration:4,overlap:1})],[shot('前句',0,6),shot('后句',0,6)]);
 assert.match(events(result)[0],/0:00:00.00,0:00:03.50,.*前句$/);
 assert.match(events(result)[1],/0:00:03.50,0:00:07.00,.*后句$/);
});
test('unaligned dialogue keeps the existing estimated caption fallback',()=>{
 const s={...shot('好嘞，谢谢。'),subtitleTiming:{status:'needs_review',cues:[]}};
 const result=timelineAss([clip()],[s]);
 assert.match(events(result)[0],/0:00:00.00,0:00:06.00,.*好嘞，谢谢。$/);
});
test('silent and imported clips never invent subtitle text',()=>{
 const result=timelineAss([clip(),clip()],[{duration:6,dialogueEvents:[]},null]);
 assert.equal(result.cueCount,0);
 assert.match(result.ass,/PlayResX: 1280/);
});
test('direct renderer and face-refined outputs retain verified film provenance',()=>{
 const id='film_0123456789abcdef',url='http://127.0.0.1:8188/view?filename=refined.mp4&subfolder=FaceRefine&type=output';
 const s={...shot(),videoUrl:url},c={url,shotId:'s',filmRunId:id};
 assert.equal(sourceShot(c,runId=>{assert.equal(runId,id);return {shots:[s]}}),s);
 assert.equal(sourceShot({...c,url:'http://127.0.0.1:8188/view?type=output&subfolder=FaceRefine&filename=refined.mp4'},()=>({shots:[s]})),s);
 assert.throws(()=>sourceShot({...c,url:url.replace('refined','unrelated')},()=>({shots:[s]})),/不匹配/);
 assert.throws(()=>sourceShot({...c,filmRunId:'../private'},()=>{throw Error('unexpected read')}),/来源版本无效/);
});
