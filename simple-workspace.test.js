const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 const fields=[{id:'board_script',value:'原文',type:'textarea'},{id:'asset',value:'c',type:'checkbox',checked:true},{id:'image',type:'file',value:'',files:[]}];
 const editor={dataset:{},querySelectorAll:()=>fields};let present=true;
 const c={editingShotId:'s',document:{querySelector:()=>present?editor:null},TL:{dirty:false},tlMessage:s=>c.message=s,renderShots2:()=>c.rendered=true};
 vm.createContext(c);const ui=fs.readFileSync('simple-workspace-ui.js','utf8');vm.runInContext(ui.slice(0,ui.indexOf('function simpleFold')),c);
 const timeline=fs.readFileSync('timeline-ui.js','utf8');vm.runInContext(timeline.slice(timeline.indexOf('function tlCanLeave()'),timeline.indexOf('function tlSelect(')),c);
 editor.dataset.baseline=vm.runInContext('shotEditorSignature(document.querySelector())',c);
 return {fields,c,hide:()=>present=false,run:s=>vm.runInContext(s,c)};
}
test('opening an unchanged editor does not block navigation',()=>{const x=setup();assert.equal(x.run('tlCanLeave()'),true);assert.equal(x.c.editingShotId,null);assert.equal(x.c.rendered,true)});
test('changed text, references and selected files are protected; undoing restores free navigation',()=>{
 for(const mutate of [x=>x.fields[0].value='修改',x=>x.fields[1].checked=false,x=>x.fields[2].files=[{name:'face.png',size:200,lastModified:9}]]){const x=setup();mutate(x);assert.equal(x.run('tlCanLeave()'),false);assert.equal(x.c.editingShotId,'s');assert.match(x.c.message,/未保存/)}
 const x=setup();x.fields[0].value='修改';x.fields[0].value='原文';assert.equal(x.run('tlCanLeave()'),true);
});
test('missing draft UI and unsaved sound settings remain protected',()=>{const x=setup();x.hide();assert.equal(x.run('tlCanLeave()'),false);const y=setup();y.c.TL.dirty=true;assert.equal(y.run('tlCanLeave()'),false)});
