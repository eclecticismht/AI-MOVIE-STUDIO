(function(root){
 function save(data,id,expected,prompt){
  const shot=data.shots.find(s=>s.id===id&&s.projectId===data.activeProjectId&&!s.autoArchived);
  if(!shot||JSON.stringify(shot)!==expected)throw Error('镜头已在其他位置修改，请先复制提示词，再重新打开镜头核对。');
  if(typeof prompt!=='string'||!prompt.trim()||prompt.length>30000)throw Error('请填写 H3 提示词，最多 30000 字。');
  if(/<d\b/i.test(prompt))throw Error('对白请在分镜的对白栏填写；提示词中不要直接加入 <d> 台词标签。');
  const sync=typeof module!=='undefined'&&module.exports?require('./film-source-sync'):root.FilmSourceSync;
  const result=sync.replaceWithDependents(data.shots,shot,{...shot,prompt:prompt.trim()});
  return {...data,shots:result.shots};
 }
 const api={save};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TimelinePrompt=api;
})(typeof globalThis!=='undefined'?globalThis:this);
