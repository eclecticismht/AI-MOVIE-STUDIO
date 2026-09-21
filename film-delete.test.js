const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {deleteFilmFiles,canDeleteFilm}=require('./film-delete');
test('delete removes only the selected version and rejects traversal',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ams-delete-')),one='film_'+'a'.repeat(16),two='film_'+'b'.repeat(16);
 for(const id of [one,two]){fs.mkdirSync(path.join(root,id));fs.writeFileSync(path.join(root,id,'movie.mp4'),'fixture');}
 assert.throws(()=>deleteFilmFiles(root,'../other'));
 deleteFilmFiles(root,one);assert.equal(fs.existsSync(path.join(root,one)),false);assert.equal(fs.readFileSync(path.join(root,two,'movie.mp4'),'utf8'),'fixture');
 deleteFilmFiles(root,two);fs.rmdirSync(root);
});
test('delete checks project and active processing',()=>{
 const run={projectId:'p',status:'complete'};canDeleteFilm(run,'p');
 assert.throws(()=>canDeleteFilm(run,'other'));assert.throws(()=>canDeleteFilm(run,'p',true));
 for(const extra of [{status:'rendering'},{status:'pending'},{rechecking:true},{audit:{status:'running'}}])assert.throws(()=>canDeleteFilm({...run,...extra},'p'));
});
