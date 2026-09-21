const {test}=require('node:test'),assert=require('node:assert/strict'),{draw}=require('./screen-layout');
function canvas(){const texts=[],ctx={fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},measureText(t){return {width:t.length*35}},fillText(t){texts.push(t)}};return {texts,getContext(){return ctx}}}
test('exact text layout preserves messages and amounts without a payment control',()=>{
 const c=canvas();draw(c,'再转五百呗\n我在买单\n余额页：603.72元');assert.equal(c.width,1280);assert.equal(c.height,720);assert.deepEqual(c.texts,['消息','再转五百呗','我在买单','余额页：603.72元']);
});
test('typing background never pre-renders drafts as sent messages',()=>{
 const c=canvas();draw(c,'好\n我这个月真没了',{typing:true});assert.deepEqual(c.texts,['编辑消息','未发送']);
});
