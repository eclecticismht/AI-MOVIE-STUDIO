const {test}=require('node:test'),assert=require('node:assert/strict'),{Readable}=require('node:stream');
const {readUtf8}=require('./request-body');
test('Chinese dialogue survives arbitrary byte boundaries including single-byte chunks',async()=>{
 const text=JSON.stringify({dialogue:'老张：老实人，还有多少？',story:'手机震了一下。又震了一下。他没翻。'}),bytes=Buffer.from(text);
 const result=await readUtf8(Readable.from([...bytes].map(b=>Buffer.from([b]))),1000);assert.equal(result,text);assert.equal(JSON.parse(result).dialogue,'老张：老实人，还有多少？');
});
test('body limits count bytes rather than characters and malformed UTF8 is rejected',async()=>{
 await assert.rejects(readUtf8(Readable.from([Buffer.from('中文')]),5),/请求过大/);
 await assert.rejects(readUtf8(Readable.from([Buffer.from([0xe4,0xb8])]),10));
});
