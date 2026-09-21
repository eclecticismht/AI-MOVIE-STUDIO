const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('new projects initialize creative fields before the first render',()=>{
  const html=fs.readFileSync('AI_MOVIE_STUDIO.html','utf8');
  const create=html.split('\n').find(line=>line.startsWith('function createFromWizard()'));
  const upgrade=html.match(/function upgrade\(\)\{[\s\S]*?\n\}/)[0];
  const D={projects:[],masters:[],audio:[]};let rendered=false;
  const ctx=vm.createContext({D,W:{name:'老实人',target:8,logline:'善良的边界'},rememberProjectOptions(){},localStorage:{setItem(){}},wizard:{classList:{add(){}}},alert(){},render(){},openCockpit(){},persist(){assert.equal(D.projects[0].bible.logline,'善良的边界');rendered=true}});
  vm.runInContext(upgrade+'\n'+create+'\ncreateFromWizard()',ctx);
  assert.equal(rendered,true);
});
