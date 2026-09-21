(function(root){
 function clean(value){if(Array.isArray(value))return value.map(clean);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['__proto__','constructor','prototype'].includes(key)&&!/^(api[-_]?key|authorization|password|accessToken|refreshToken)$/i.test(key)).map(([k,v])=>[k,clean(v)]));return value;}
 function encode(data){return JSON.stringify({format:'ai-movie-studio-backup',version:1,createdAt:new Date().toISOString(),data:clean(data)},null,2);}
 function decode(text){
  const value=JSON.parse(text);if(value.format!=='ai-movie-studio-backup'||value.version!==1)throw Error('请选择本工具导出的版本 1 备份');
  const data=clean(value.data);if(!data||!Array.isArray(data.projects)||!data.projects.length)throw Error('备份缺少项目');
  for(const key of ['projects','shots','jobs','generations','masters','audio','characters','scenes','props','scripts']){
   if(!Array.isArray(data[key]))throw Error('备份缺少列表：'+key);
   const ids=new Set();for(const item of data[key]){if(!item||typeof item.id!=='string'||!item.id||ids.has(item.id))throw Error('备份存在无效或重复记录：'+key);ids.add(item.id);}
  }
  const projects=new Set(data.projects.map(p=>p.id));if(!projects.has(data.activeProjectId))throw Error('当前项目不存在');
  for(const key of ['shots','jobs','generations','masters','audio','characters','scenes','props','scripts'])for(const item of data[key])if(!projects.has(item.projectId))throw Error('备份记录引用了不存在的项目：'+key);
  return data;
 }
 const api={encode,decode};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ProjectBackup=api;
})(typeof globalThis!=='undefined'?globalThis:this);
