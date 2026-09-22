const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('only selected provider has an input; persisted keys are never rendered',()=>{
 const p={screenplayModel:'deepseek-flash'},ctx=vm.createContext({screenplayApiKey:'',screenplayServerConfigured:false,activeProject:()=>p,esc:String,renderScripts(){},renderShots2(){},location:{protocol:'file:'}});vm.runInContext(fs.readFileSync('text-ai-ui.js','utf8'),ctx);
 let html=vm.runInContext('textAISettings()',ctx);assert.match(html,/id="ams-deepseek-credential"/);assert.ok(!html.includes('id="ams-openai-credential"'));assert.match(html,/autocomplete="new-password"/);
 vm.runInContext('textAIStatus={local:{deepseek:true},configured:{deepseek:true}}',ctx);html=vm.runInContext('textAISettings()',ctx);assert.ok(!html.includes('type="password"'));assert.match(html,/已加密保存在本机/);
 p.screenplayModel='gpt-5.4';html=vm.runInContext('textAISettings()',ctx);assert.match(html,/id="ams-openai-credential"/);assert.ok(!html.includes('id="ams-deepseek-credential"'));
});
