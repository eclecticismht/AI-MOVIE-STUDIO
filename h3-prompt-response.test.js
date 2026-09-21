const {test}=require('node:test'),assert=require('node:assert/strict'),{parseResponse}=require('./h3-prompt-response');
const prompt='integrated_multimodal_description: table\noverall_soundscape: room tone\nnon_diegetic_music: N/A';
const shots=[{id:'one'},{id:'two'}];
test('response matches shot IDs rather than trusting model array order',()=>{
 const result=parseResponse(JSON.stringify({prompts:[{id:'two',prompt:'  '+prompt+'\n'},{id:'one',prompt}]}),shots);
 assert.deepEqual(result.map(p=>p.id),['one','two']);assert.equal(result[1].prompt,prompt);
});
test('missing, duplicate and unrelated shot IDs cannot overwrite cached prompts',()=>{
 for(const ids of [['one'],['one','one'],['one','other']])assert.throws(()=>parseResponse(JSON.stringify({prompts:ids.map(id=>({id,prompt}))}),shots));
});
test('malformed fields and leaked spoken dialogue give a specific failure without accepting partial content',()=>{
 for(const bad of ['table',prompt+' <d speaker="wrong">hello</d>'])assert.throws(()=>parseResponse(JSON.stringify({prompts:[{id:'one',prompt},{id:'two',prompt:bad}]}),shots),/two/);
 assert.throws(()=>parseResponse('{',shots),/JSON/);
});
