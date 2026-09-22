// Recover exact legacy delete operations once, using saved grouping history.
try{
 const stored=JSON.parse(localStorage.getItem('aimovie_data')||'null');
 if(stored&&StoryActDeletion.migrate(stored)){localStorage.setItem('aimovie_data',JSON.stringify(stored));Object.assign(D,stored);}
}catch(error){console.warn('场次删除记录迁移未完成：'+error.message)}
const previewBeforeActDeletion=tlPreview;
tlPreview=function(){
 if(tlCurrent())return previewBeforeActDeletion();
 cutClear();const screen=document.getElementById('tl-screen');
 if(screen){const message=document.createElement('div');message.className='tl-placeholder';message.textContent='当前时间线暂无镜头，请添加场次并生成分镜。';screen.append(message)}
 const label=document.getElementById('tl-preview-label');if(label)label.textContent='等待素材';timelinePreviewActions();
};
