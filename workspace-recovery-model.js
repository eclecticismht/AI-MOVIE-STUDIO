// Explicit field-level recovery. Never promote an old whole-workspace browser copy.
(function(root){
 'use strict';
 const fields=['title','content','storyText'],labels={title:'场次名称',content:'场次内容',storyText:'本场原文'};
 const key=d=>JSON.stringify([d.projectId,d.scope,d.actId,d.field]);
 const groupKey=d=>JSON.stringify([d.projectId,d.scope,d.actId]);
 const project=(data,id)=>data?.projects?.find(p=>p.id===id);
 const group=(data,row)=>project(data,row.projectId)?.storyActs?.[row.scope];
 const act=(data,row)=>group(data,row)?.acts?.find(a=>a.id===row.actId);
 const text=v=>String(v??'');
 const clone=v=>JSON.parse(JSON.stringify(v));
 function valid(d){
  if(!d||!['projectId','scope','actId'].every(k=>typeof d[k]==='string'&&d[k])||!fields.includes(d.field)||typeof d.text!=='string'||d.text.length>60000||d.base!==undefined&&typeof d.base!=='string')throw Error('恢复草稿格式无效，原副本未修改。');
 }
 function inspect(disk,browser,records=[],projectId){
  if(!disk?.projects?.length)throw Error('磁盘工作区无法读取，不能进行恢复。');
  const selected=projectId||browser?.activeProjectId||disk.activeProjectId,rows=new Map();
  const add=(d,source,storageKey)=>{
   valid(d);if(d.projectId!==selected)return;
   const current=act(disk,d),local=act(browser,d),exists=!!current;
   const diskText=exists?text(current[d.field]):'',knownBase=source==='draft',base=knownBase?d.base:undefined;
   const status=!exists?'missing':diskText===d.text||knownBase&&d.text===base?'same':knownBase&&diskText===base?'safe':'conflict';
   const siblings=group(disk,d)?.acts||[],sameTitle=siblings.filter(a=>a.id!==d.actId&&a.title===(local?.title||current?.title));
   rows.set(key(d),{...d,key:key(d),source,storageKey,knownBase,status,diskText,projectName:project(disk,d.projectId)?.name||project(browser,d.projectId)?.name||d.projectId,title:local?.title||current?.title||'未命名场次',label:labels[d.field],canCreate:!exists&&!!group(disk,d),sameTitle:sameTitle.map(a=>a.title),defaultChoice:status==='same'?'disk':status==='safe'?'local':''});
  };
  for(const record of records){const d=record.draft;if(d?.projectId!==selected)continue;valid(d);if(rows.has(key(d)))throw Error('同一场次字段存在重复恢复记录，请保留副本后核对。');add(d,'draft',record.storageKey);}
  const localProject=project(browser,selected);
  for(const [scope,g] of Object.entries(localProject?.storyActs||{}))for(const a of g.acts||[])for(const field of fields){
   const d={projectId:selected,scope,actId:a.id,field,text:text(a[field])};if(rows.has(key(d)))continue;
   const current=act(disk,d);
   if(!current&&!d.text)continue;
   if(current&&text(current[field])===d.text)continue;
   add(d,'browser');
  }
  return {projectId:selected,rows:[...rows.values()],diskActs:Object.values(project(disk,selected)?.storyActs||{}).flatMap(g=>g.acts||[]).map(a=>({id:a.id,title:a.title,storyChars:text(a.storyText).length,shots:a.shotIds?.length||0})),browserProjectPresent:!!localProject};
 }
 function apply(disk,browser,inspection,choices={},createId=()=>{throw Error('未提供安全的新场次编号')}){
  const data=clone(disk),created=new Map(),newChoices=new Map(),changes=[];
  for(const row of inspection.rows){
   const choice=choices[row.key]??row.defaultChoice;
   const allowed=row.status==='missing'?(row.canCreate?['disk','new']:['disk']):['disk','local'];
   if(!allowed.includes(choice))throw Error('请先核对“'+row.title+' / '+row.label+'”，明确选择保留哪一份。');
   if(row.status==='missing'){
    const k=groupKey(row),prior=newChoices.get(k);if(prior&&prior!==choice)throw Error('同一新增场次的各字段须统一选择另存为新场次，或统一保留为备份。');newChoices.set(k,choice);
   }
  }
  for(const row of inspection.rows){
   const choice=choices[row.key]??row.defaultChoice;if(choice==='disk')continue;
   valid(row);const current=act(data,row);
   if(choice==='local'){
    if(!current||text(current[row.field])!==row.diskText)throw Error('磁盘字段已变化，请重新核对。');
    if(text(current[row.field])!==row.text){current[row.field]=row.text;changes.push({actId:row.actId,field:row.field,kind:'field'});}continue;
   }
   const k=groupKey(row);let target=created.get(k);
   if(!target){
    const destination=group(data,row);if(!destination)throw Error('目标场次分组已移除，未擅自重建。');
    const id=createId();if(typeof id!=='string'||!id||data.projects.some(p=>Object.values(p.storyActs||{}).some(g=>(g.acts||[]).some(a=>a.id===id))))throw Error('恢复场次编号无效或重复。');
    const local=act(browser,row);target={id,title:text(local?.title||row.title)+'（恢复草稿）',content:text(local?.content),storyText:text(local?.storyText),shotIds:[]};
    destination.acts.push(target);created.set(k,target);changes.push({actId:id,kind:'new-text-only-scene'});
   }
   target[row.field]=row.field==='title'?row.text+'（恢复草稿）':row.text;
  }
  return {data,changes,created:[...created.values()].map(a=>({id:a.id,title:a.title})),resolvedStorageKeys:inspection.rows.filter(r=>r.storageKey).map(r=>r.storageKey)};
 }
 // Small injectable coordinator: archive both copies and drafts BEFORE any commit.
 async function commit(snapshot,merged,io){
  const unchanged=()=>{if(io.localSignature()!==snapshot.localSignature)throw Error('原页面或其他标签页又有修改，已停止覆盖。请重新检查。');};
  unchanged();
  const recovery={kind:'scene-field-recovery',at:new Date().toISOString(),diskRevision:snapshot.disk.revision,selectedProjectId:snapshot.inspection.projectId,drafts:snapshot.records,decisions:snapshot.decisions};
  const browserBackup=await io.archive({...snapshot.browser,_workspaceRecovery:recovery});
  const diskBackup=await io.archive({...snapshot.disk.data,_workspaceRecovery:{kind:'disk-before-scene-recovery',at:recovery.at}});
  unchanged();const current=await io.readDisk();if(current.revision!==snapshot.disk.revision)throw Error('备份期间磁盘版本已更新；备份已保留，请重新检查。');
  unchanged();let saved;
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  if(equal(merged.data,current.data))saved=current;
  else try{saved=await io.saveDisk(merged.data,current.revision)}catch(error){
   let actual;try{actual=await io.readDisk()}catch{}
   if(!actual||!equal(actual.data,merged.data))throw error;saved=actual;
  }
  try{unchanged();await io.acceptBrowser(merged.data);io.clearResolved(merged.resolvedStorageKeys);}catch(error){error.diskCommitted=true;error.backups=[browserBackup.name,diskBackup.name];throw error;}
  return {revision:saved.revision,backups:[browserBackup.name,diskBackup.name],changes:merged.changes,created:merged.created};
 }
 const api={inspect,apply,commit,key,fields};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WorkspaceRecovery=api;
})(typeof globalThis!=='undefined'?globalThis:this);
