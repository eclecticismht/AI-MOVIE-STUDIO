// Field-level merge: a story draft can never replace unrelated project records.
(function(root){
 'use strict';
 const fields=['storyText','content','title'];
 const key=d=>JSON.stringify([d.projectId,d.scope,d.actId,d.field]);
 function validate(d){
  if(!d||!['projectId','scope','actId'].every(k=>typeof d[k]==='string'&&d[k])||!fields.includes(d.field)||typeof d.base!=='string'||typeof d.text!=='string')throw Error('场次草稿格式无效，未写入工作区。');
  return d;
 }
 function apply(data,drafts){
  const next={...data,projects:[...data.projects]};
  for(const raw of drafts){
   const d=validate(raw),index=next.projects.findIndex(p=>p.id===d.projectId);
   if(d.text.length>60000)throw Error('单个场次字段最多 60,000 字，当前输入仍保留，请分场整理。');
   if(index<0)throw Error('草稿所属项目已移除，未覆盖其他项目。');
   const p=next.projects[index],existing=p.storyActs?.[d.scope];
   if(!existing&&d.hadScope)throw Error('草稿所属场次分组已变化，原文草稿仍保留，请核对后再保存。');
   const group=existing||{acts:d.initialActs,history:[],deletionVersion:1};
   const act=group.acts?.find(a=>a.id===d.actId);
   if(!act)throw Error('草稿所属场次已移除，未重新创建或覆盖。');
   const current=String(act[d.field]??'');
   if(current!==d.base&&current!==d.text)throw Error('本场原文已在其他位置修改，未覆盖；你的输入草稿仍保留。');
   const acts=group.acts.map(a=>a.id===d.actId?{...a,[d.field]:d.text}:a);
   next.projects[index]={...p,storyActs:{...p.storyActs,[d.scope]:{...group,acts}}};
  }
  return next;
 }
 const api={fields,key,validate,apply};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ActTextDrafts=api;
})(typeof globalThis!=='undefined'?globalThis:this);
