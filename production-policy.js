const fs=require('node:fs'),path=require('node:path');

// Read the persisted project on every submission so a saved hold takes effect
// even when an older browser tab is still open. Reading results remains allowed.
function assertGenerationAllowed(projectId,root=__dirname){
  const file=path.join(root,'.runtime','workspace','current.json');
  let workspace;
  try{workspace=JSON.parse(fs.readFileSync(file,'utf8'))}
  catch(error){if(error.code==='ENOENT')return;throw Error('H3 无法读取项目制作状态，已停止提交；请先恢复工作室数据。')}
  const projects=workspace.data?.projects;
  if(!Array.isArray(projects))throw Error('H3 项目制作状态损坏，已停止提交；请先恢复工作室数据。');
  const policy=projects.find(p=>p.id===projectId)?.productionPolicy;
  if(policy?.generationHold===true)throw Error('H3 项目处于准备阶段，暂不生成新素材。'+(policy.holdReason||'请先完成对白、配音与节奏验收。'));
}
module.exports={assertGenerationAllowed};
