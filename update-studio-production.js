const fs=require('fs');let s=fs.readFileSync('AI_MOVIE_STUDIO.html','utf8');s=s.replace('<script src="film-ui.js"></script>','<script src="film-studio-summary.js"></script>\n<script src="film-ui.js"></script>');s=s.replace('🎙声音 → ✂️Premiere → 📦4K成片','🎙声音 → ✂️自动成片 → 📦MP4成片');s=s.replace('["制作中",D.projects.filter','["标记制作中",D.projects.filter').replace('["已完成分钟",finished.toFixed(2)]','["已审核镜头分钟",finished.toFixed(2)]');fs.writeFileSync('AI_MOVIE_STUDIO.html',s);
s=fs.readFileSync('film-ui.js','utf8');s=s.replace("if(document.getElementById('edit')?.classList.contains('on'))renderEdit();if(document.getElementById('masters')", "if(document.getElementById('studio')?.classList.contains('on'))renderStudio();if(document.getElementById('edit')?.classList.contains('on'))renderEdit();if(document.getElementById('masters')");s+=`\nconst renderStudioBeforeFilms=renderStudio;
renderStudio=function(){
 renderStudioBeforeFilms();const root=document.getElementById('studio');if(!root)return;
 document.getElementById('studioFilmProduction')?.remove();
 const labels={pending:'准备开始',rendering:'正在制作镜头',assembling:'正在自动合成',complete:'视频已生成，待验收',paused:'制作暂停',failed:'需要处理'};
 const entries=FilmStudioSummary.latestByProject(filmRuns,D.projects);
 root.insertAdjacentHTML('beforeend','<div class="card" id="studioFilmProduction"><h3>自动制作实时状态</h3><p class="muted">显示各项目最近的自动制作任务；上方已审核时长按审片结果统计。</p>'+entries.map(({project,run})=>'<p><b>'+esc(project.name)+'</b> · '+esc(labels[run.status]||run.status)+' · '+run.completed+'/'+run.total+' 镜'+(run.videoUrl?' · <a class="btn" href="'+esc(run.videoUrl)+'" target="_blank" rel="noopener">查看视频</a>':'')+'</p>').join('')+(entries.length?'':'<p class="muted">暂无自动制作任务</p>')+'</div>');
};
`;fs.writeFileSync('film-ui.js',s);
