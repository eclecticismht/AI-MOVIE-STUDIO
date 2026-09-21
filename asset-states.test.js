const {test}=require('node:test'),assert=require('node:assert/strict');
const {validate,resolve}=require('./asset-states');
const {parseStoryboard}=require('./screenplay-api');
test('per-shot states preserve the library and isolate state images',()=>{
  const asset={name:'余额',notes:'余额会变化',imageUrl:'/assets/initial.png'};
  const states=validate({p:{description:'转账后',screenText:'603.72',imageUrl:'/assets/after.png'}},['p'],'屏幕显示603.72');
  const current=resolve(asset,states.p);assert.equal(current.imageUrl,'/assets/after.png');assert.match(current.notes,/603.72/);assert.equal(asset.imageUrl,'/assets/initial.png');assert.equal(resolve(asset).imageUrl,'/assets/initial.png');
});
test('screen text must come from this shot and reference only selected assets',()=>{
  assert.throws(()=>validate({p:{screenText:'603.72'}},['p'],'余额1603.71'),/原文/);
  assert.throws(()=>validate({p:{screenText:'603.72'}},['p'],'余额1603.72'),/原文/);
  assert.throws(()=>validate({p:{description:'later'}},['other']),/未选中/);
  assert.throws(()=>validate({p:{imageUrl:'file:///private.png'}},['p']),/地址/);
});
test('storyboard accepts grounded states but rejects invented picture URLs',()=>{
  const shot={scene:'室内',sourceExcerpt:'屏幕显示603.72',action:'查看余额',visual:'手机近景',camera:'固定',characters:'',dialogue:'',duration:5,characterIds:[],sceneIds:['s'],propIds:['p'],assetStates:{p:{description:'当前余额',screenText:'603.72'}}};
  const assets={characters:[],scenes:[{id:'s'}],props:[{id:'p'}]};
  const parse=x=>parseStoryboard(JSON.stringify({shots:[x]}),'屏幕显示603.72',assets);
  assert.equal(parse(shot)[0].assetStates.p.screenText,'603.72');
  assert.throws(()=>parse({...shot,assetStates:{p:{imageUrl:'/assets/invented.png'}}}),/编造/);
});
