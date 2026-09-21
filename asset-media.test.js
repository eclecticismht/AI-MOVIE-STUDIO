const {test}=require('node:test'),assert=require('node:assert/strict');
const {MAX_BYTES,validateMedia}=require('./asset-media-api');
test('JPG and MP4 extension recognition works without browser MIME metadata',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),context=vm.createContext({});
 vm.runInContext(fs.readFileSync('asset-media-ui.js','utf8'),context);
 assert.equal(context.assetMediaType({name:'照片.JPG',type:''}),'image/jpeg');
 assert.equal(context.assetMediaType({name:'视频.mp4',type:'application/octet-stream'}),'video/mp4');
 assert.throws(()=>context.assetMediaType({name:'bad.exe',type:''}),/支持/);
 const mp4=Buffer.alloc(24);mp4.write('ftyp',4);assert.match(validateMedia('video/mp4',mp4),/\.mp4$/);
 assert.throws(()=>validateMedia('video/mp4',Buffer.from('<html>not video</html>')),/格式/);
});
test('asset uploads accept exactly 5 MB and reject one extra byte',()=>{
 const bytes=Buffer.alloc(MAX_BYTES);bytes[0]=255;bytes[1]=216;
 assert.match(validateMedia('image/jpeg',bytes),/^asset-[a-f0-9]{64}\.jpg$/);
 assert.throws(()=>validateMedia('image/jpeg',Buffer.concat([bytes,Buffer.from([0])])),/5 MB/);
 assert.throws(()=>validateMedia('image/png',bytes),/格式/);
 assert.throws(()=>validateMedia('text/html',bytes),/请选择/);
});
test('asset import only commits project data after storage succeeds',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');
 const original={id:'a',imageUrl:'old'},D={characters:[original]};let rendered=0,message='';
 const context=vm.createContext({D,fetch:async()=>({ok:true,json:async()=>({url:'/assets/imported/test.jpg'})}),localStorage:{setItem(){throw Error('quota')}},renderModules(){rendered++},alert(t){message=t}});
 vm.runInContext(fs.readFileSync('asset-media-ui.js','utf8'),context);
 const input={files:[{size:MAX_BYTES,type:'image/jpeg'}]};
 await context.importAssetMedia('characters','a','image',input);
 assert.equal(D.characters[0],original);assert.equal(rendered,0);assert.match(message,/quota/);assert.equal(input.disabled,false);
 context.localStorage.setItem=()=>{};await context.importAssetMedia('characters','a','image',input);
 assert.equal(D.characters[0].imageUrl,'/assets/imported/test.jpg');assert.equal(rendered,1);
});
test('video imports supply a usable image reference without overwriting a chosen portrait',async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),D={characters:[{id:'a'}]};let poster='/assets/imported/first.jpg';
 const c=vm.createContext({D,fetch:async()=>({ok:true,json:async()=>({url:'/assets/imported/movie.mp4',posterUrl:poster})}),localStorage:{setItem(){}},renderModules(){},alert(t){throw Error(t)}});
 vm.runInContext(fs.readFileSync('asset-media-ui.js','utf8'),c);
 const input={files:[{size:1200,name:'clip.MP4',type:''}]};await c.importAssetMedia('characters','a','video',input);assert.equal(D.characters[0].imageUrl,poster);
 poster='/assets/imported/next.jpg';await c.importAssetMedia('characters','a','video',input);assert.equal(D.characters[0].imageUrl,poster);
 D.characters[0].imageUrl='/assets/custom-portrait.png';await c.importAssetMedia('characters','a','video',input);assert.equal(D.characters[0].imageUrl,'/assets/custom-portrait.png');
});
