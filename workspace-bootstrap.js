(function(root){
 const initial={"project": {"name": "人生评分99分", "universe": "未来人间", "target": 15}, "shots": [{"id": "S01_SH001", "desc": "未来城市建立镜头", "char": "—", "scene": "未来城市CBD", "dur": 5, "status": "待制作", "prompt": "写实电影感，未来中国城市清晨，社会评分系统融入日常环境。"}, {"id": "S01_SH002", "desc": "陈伟进入办公室", "char": "陈伟", "scene": "办公室", "dur": 6, "status": "待制作", "prompt": "陈伟进入现代办公室，中年精英感，自然表演，稳定跟拍。"}, {"id": "S01_SH003", "desc": "人生评分手机特写", "char": "陈伟", "scene": "办公室", "dur": 4, "status": "待制作", "prompt": "手机显示人生评分98.7，轻微俯拍，slow push in，不安。"}, {"id": "S01_SH004", "desc": "陈伟表情变化", "char": "陈伟", "scene": "办公室", "dur": 5, "status": "待制作", "prompt": "陈伟从平静转为疑惑不安，微表情，浅景深。"}], "jobs": [], "generations": [], "node": {"name": "NODE_01", "gpu": "RTX Pro 4000 24GB", "status": "未连接"}};
 function isDemo(data){
  const p=data?.projects?.[0];if(!p||data.projects.length!==1||p.id!=='P001'||p.name!==initial.project.name||p.storyText||p.screenplayNotes||p.storyActs||p.storyFlow||p.wizard)return false;
  if(p.bible&&Object.entries(p.bible).some(([k,v])=>v&&!(k==='style'&&v==='写实电影感')))return false;
  return data.shots?.length===4&&data.shots.every(s=>{const expected=initial.shots.find(x=>x.id===s.id);return expected&&Object.keys(s).every(k=>k==='projectId'?s[k]==='P001':s[k]===expected[k])&&Object.entries(expected).every(([k,v])=>s[k]===v)})&&['scripts','characters','scenes','props','jobs','generations','masters','audio','storyboardBatches'].every(k=>!data[k]?.length);
 }
 function hydrate(storage,disk){
  if(!disk?.data)return false;
  const before=storage.getItem('aimovie_data');let local;
  try{local=before?JSON.parse(before):null}catch{return false}
  // Only a missing or untouched example workspace may be filled automatically.
  if(before&&!isDemo(local))return false;
  if(before===JSON.stringify(disk.data))return false;
  if(before)storage.setItem('aimovie_before_disk_bootstrap',before);
  storage.setItem('aimovie_data',JSON.stringify(disk.data));return true;
 }
 const api={initial,isDemo,hydrate};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WorkspaceBootstrap=api;
})(typeof globalThis!=='undefined'?globalThis:this);
