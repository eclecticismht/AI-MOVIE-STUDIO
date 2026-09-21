(function(root){
 const Sync=typeof module!=='undefined'&&module.exports?require('./film-source-sync'):root.FilmSourceSync;
 function context(data,id){const shot=data.shots.find(s=>s.id===id&&s.projectId===data.activeProjectId);if(!shot)throw Error('镜头不存在或项目已切换。');const project=data.projects.find(p=>p.id===shot.projectId),batch=(data.storyboardBatches||[]).find(b=>b.id===shot.storyboardBatchId&&b.projectId===shot.projectId),script=data.scripts.find(s=>s.id===(shot.scriptId||batch?.sourceScriptId)&&s.projectId===shot.projectId);return {shot,project,script,batch}}
 function signature(data,id){const {shot,project,script}=context(data,id);return JSON.stringify({shot,story:project.storyText??project.bible?.synopsis??'',script})}
 function replace(text,before,after,label){if(!before?.trim())throw Error(label+'缺少待替换原句，请先选择原文范围。');const start=text.indexOf(before);if(start<0)throw Error(label+'中找不到原引用，可能已被修改。请重新核对待替换原句。');if(text.indexOf(before,start+1)>=0)throw Error(label+'中有多处相同文字，请增加上下文以唯一定位。');return text.slice(0,start)+after+text.slice(start+before.length)}
 function plan(data,id,input,now=new Date().toISOString()){
  const {shot,project,script}=context(data,id),excerpt=String(input.excerpt||'').trim();if(!excerpt)throw Error('对应原文不能为空。');if(excerpt.length>30000)throw Error('单镜对应原文超过 30,000 字，请拆分镜头。');
  const old=shot.sourceExcerpt||'',story=project.storyText??project.bible?.synopsis??'';
  let content=script?.content,storyText=story;
  if(input.script){if(!script)throw Error('本镜没有可编辑的来源剧本。');content=replace(content,old,excerpt,'来源剧本');if(content.length>60000)throw Error('同步后剧本超过 60,000 字。')}
  if(input.story){const after=String(input.storyAfter||'').trim();if(!after)throw Error('请填写同步后的故事文字。');storyText=replace(story,input.storyBefore,after,'故事原文');if(storyText.length>60000)throw Error('同步后故事超过 60,000 字。')}
  if(excerpt===old&&content===script?.content&&storyText===story&&!shot.sourceReviewRequired)throw Error('内容没有变化，无需同步。');
  const updated={...shot,sourceExcerpt:excerpt,sourceReviewRequired:false};
  let shots=Sync.replaceWithDependents(data.shots,shot,updated).shots;
  const affected=[];
  if(input.script&&content!==script.content){const start=script.content.indexOf(old),end=start+old.length;shots=shots.map(s=>{if(s.id===shot.id||s.projectId!==shot.projectId||s.scriptId!==script.id||s.autoArchived)return s;const quote=s.sourceExcerpt||'';if(!quote)return s;let at=script.content.indexOf(quote),overlap=false;while(at>=0){if(at<end&&at+quote.length>start){overlap=true;break}at=script.content.indexOf(quote,at+1)}if(!overlap&&content.includes(quote))return s;affected.push(s.id);return {...s,sourceReviewRequired:true,status:'需核对原文'}});}
  const record={at:now,shotId:id,scriptId:script?.id,excerptBefore:old,excerptAfter:excerpt,script:!!input.script,story:!!input.story,storyBefore:input.story?input.storyBefore:'',storyAfter:input.story?input.storyAfter:'',affected};
  const projects=data.projects.map(p=>p===project?{...p,...(input.story?{storyText,storyImports:[...(p.storyImports||[]),{name:'分镜同步前原文',text:story,at:now}].slice(-5)}:{}),sourceSyncHistory:[...(p.sourceSyncHistory||[]),record].slice(-10)}:p);
  const scripts=data.scripts.map(s=>s===script&&input.script?{...s,content,status:'已编辑',updatedAt:now}:s);
  return {next:{...data,projects,scripts,shots},affected,record,before:{excerpt:old,story:input.storyBefore||''},after:{excerpt,story:input.storyAfter||''}};
 }
 const api={context,signature,replace,plan};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SourceSync=api;
})(typeof globalThis!=='undefined'?globalThis:this);
