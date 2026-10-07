const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const Archive=require('./generated-asset-archive');

async function setup(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ams-archive-test-')),workspace=path.join(root,'studio'),target=path.join(root,'Downloads','我不是西门庆');
 fs.mkdirSync(path.join(workspace,'.runtime'),{recursive:true});fs.writeFileSync(path.join(workspace,'.runtime','generated-assets-archive.json'),JSON.stringify({projects:{XMQ120_20260928:target}}));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return {root:workspace,target};
}

test('archives only the configured project, writes checksummed indexes, and preserves conflicting versions',async t=>{
 const x=await setup(t),first=Buffer.from('first PNG bytes'),second=Buffer.from('second PNG bytes');
 const a=await Archive.archiveBuffer({root:x.root,projectId:'XMQ120_20260928',kind:'firstFrame',key:'frame-1',filename:'frame-1.png',bytes:first,shotId:'shot-1'});
 assert.equal(fs.readFileSync(path.join(x.target,a.relativePath)).toString(),'first PNG bytes');assert.equal(a.shotId,'shot-1');
 const b=await Archive.archiveBuffer({root:x.root,projectId:'XMQ120_20260928',kind:'firstFrame',key:'frame-1',filename:'frame-1.png',bytes:second,shotId:'shot-1'});
 assert.notEqual(a.relativePath,b.relativePath);assert.match(b.relativePath,/02\.png$/);assert.equal(fs.readFileSync(path.join(x.target,a.relativePath)).toString(),'first PNG bytes');
 const listed=Archive.list(x.root,'XMQ120_20260928');assert.equal(listed.enabled,true);assert.equal(listed.assets.length,2);assert.ok(listed.assets.every(item=>/^[a-f0-9]{64}$/.test(item.sha256)&&item.url.startsWith('/api/generated-assets/')));
 assert.equal(await Archive.archiveBuffer({root:x.root,projectId:'AMS-003',kind:'firstFrame',key:'other',filename:'other.png',bytes:first}),null);assert.deepEqual(Archive.list(x.root,'AMS-003'),{enabled:false,assets:[]});
});

test('copies finished masters and streams H3 media into the configured archive',async t=>{
 const x=await setup(t),source=path.join(x.root,'film-runs','movie.mp4'),master=Buffer.from('finished MP4');fs.mkdirSync(path.dirname(source),{recursive:true});fs.writeFileSync(source,master);
 const exported=await Archive.archiveFile({root:x.root,projectId:'XMQ120_20260928',kind:'master',key:'film-1',filename:'film-1.mp4',sourcePath:source,runId:'film-1'});
 assert.equal(fs.readFileSync(source).toString(),'finished MP4');assert.equal(fs.readFileSync(path.join(x.target,exported.relativePath)).toString(),'finished MP4');
 const clip=await Archive.archiveUrl({root:x.root,projectId:'XMQ120_20260928',kind:'h3Video',key:'job-1',filename:'shot.mp4',url:'http://comfy.invalid/view',fetchImpl:async()=>new Response(Buffer.from('generated H3 clip'))});
 assert.equal(fs.readFileSync(path.join(x.target,clip.relativePath)).toString(),'generated H3 clip');assert.equal(Archive.list(x.root,'XMQ120_20260928').assets.length,2);
});

test('archive API lists and streams only indexed project files',async t=>{
 const x=await setup(t),record=await Archive.archiveBuffer({root:x.root,projectId:'XMQ120_20260928',kind:'firstFrame',key:'frame-2',filename:'frame.png',bytes:Buffer.from('image data')});
 const server=http.createServer((req,res)=>Archive.api(x.root,req,res,new URL(req.url,'http://localhost').pathname));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port,list=await(await fetch(base+'/api/generated-assets?projectId=XMQ120_20260928')).json();assert.equal(list.assets.length,1);
 const result=await fetch(base+record.url,{headers:{Range:'bytes=0-4'}});assert.equal(result.status,206);assert.equal(await result.text(),'image');
 const missing=await fetch(base+'/api/generated-assets/AMS-003/'+record.assetId);assert.equal(missing.status,404);
});
