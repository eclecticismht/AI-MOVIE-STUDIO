const fs=require('node:fs'),path=require('node:path');
function deleteFilmFiles(root,id){
 if(!/^film_[a-f0-9]{16}$/.test(id))throw Error('成片编号无效');
 const base=fs.realpathSync(root),target=path.resolve(base,id);
 if(path.dirname(target)!==base)throw Error('成片目录无效');
 if(!fs.existsSync(target))return;
 if(fs.lstatSync(target).isSymbolicLink()||fs.realpathSync(target)!==target)throw Error('不能删除链接目录');
 fs.rmSync(target,{recursive:true,force:false});
}
function canDeleteFilm(run,projectId,busy=false){
 if(run.projectId!==projectId)throw Error('请在该成片所属项目删除');
 if(busy||run.rechecking||run.audit?.status==='running'||!['complete','paused','failed'].includes(run.status))throw Error('成片正在制作或检查，请完成或暂停后再删除');
}
module.exports={deleteFilmFiles,canDeleteFilm};
