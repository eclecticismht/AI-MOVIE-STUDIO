const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {assertGenerationAllowed}=require('./production-policy');
test('a persisted hold blocks only its project and is reread after updates',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ams-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  assertGenerationAllowed('p',root);
  const dir=path.join(root,'.runtime','workspace');fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,'current.json'),write=hold=>fs.writeFileSync(file,JSON.stringify({data:{projects:[{id:'p',productionPolicy:{generationHold:hold,holdReason:'声音待验收'}},{id:'other'}]}}));
  write(true);assert.throws(()=>assertGenerationAllowed('p',root),/声音待验收/);assertGenerationAllowed('other',root);
  write(false);assertGenerationAllowed('p',root);
  fs.writeFileSync(file,'broken');assert.throws(()=>assertGenerationAllowed('p',root),/无法读取/);
});
