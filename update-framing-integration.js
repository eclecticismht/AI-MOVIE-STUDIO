const fs=require('fs');const p='film-api.js';let s=fs.readFileSync(p,'utf8');s=s.replace('return {...(s.sourceFingerprint?',"return {cropBottomPercent:Framing.validateBottomCrop(s.cropBottomPercent),...(s.sourceFingerprint?");s=s.replace("if(partial&&(!shot.ready||change.audioMode===undefined||change.screenCards!==undefined))throw Error('暂停版本只能更新已生成镜头的声音');","if(partial&&(!shot.ready||(change.audioMode===undefined&&change.cropBottomPercent===undefined)||change.screenCards!==undefined))throw Error('暂停版本只能更新已生成镜头的声音或画面裁切');\n    if(change.cropBottomPercent!==undefined)shot.cropBottomPercent=Framing.validateBottomCrop(change.cropBottomPercent);");s=s.replace("changes.some(c=>c.audioMode!==undefined)?' · 声音更新':' · 文字更新'","changes.some(c=>c.cropBottomPercent!==undefined)?' · 画面整理':changes.some(c=>c.audioMode!==undefined)?' · 声音更新':' · 文字更新'");
const anchor="    run.status='assembling';run.current={stage:'自动拼接与添加字幕'};save(run);";
s=s.replace(anchor,`    for(const [i,shot] of run.shots.entries())if(Framing.validateBottomCrop(shot.cropBottomPercent)>0){
      run.current={index:i+1,stage:'整理画面边缘（保留原始素材）'};save(run);
      const source=shot.audioMode&&shot.audioMode!=='model'?'sound':'clip';
      await command(['-y','-i',path.join(dir,source+'-'+i+'.mp4'),'-vf',Framing.cropFilter(shot.cropBottomPercent),'-c:v','libx264','-preset','fast','-crf','20','-c:a','copy',path.join(dir,'framed-'+i+'.mp4')],path.join(dir,'framed-'+i+'.log'));
    }
`+anchor);
s=s.replace("${s.audioMode&&s.audioMode!=='model'?'sound':'clip'}-${i}.mp4","${Framing.compositionFile(s,i)}");fs.writeFileSync(p,s);
const u='film-ui.js';s=fs.readFileSync(u,'utf8').replace('同音转写（声调一致）','同音／轻声转写可对应');
const marker='<button class="btn" ${filmRevisionBusy?\'disabled\':\'\'} onclick="saveFilmRevisionToSource()">';s=s.replace(marker,'<label>裁去底部模型字幕（0–20%，会移除相应画面）<input id="filmRevisionCrop" type="number" min="0" max="20" step="1" value="${s.cropBottomPercent||0}"></label><button class="btn" ${filmRevisionBusy?\'disabled\':\'\'} onclick="recomposeFilmFraming()">仅整理画面边缘，不重渲染</button>'+marker);
s+=`\nasync function recomposeFilmFraming(){
 if(filmRevisionBusy||!filmRevision)return;const f=filmRevision,s=f.run.shots[f.index],cropBottomPercent=Number(document.getElementById('filmRevisionCrop').value);
 if(!Number.isFinite(cropBottomPercent)||cropBottomPercent<0||cropBottomPercent>20){f.error='底部裁切须为 0–20%';renderEdit();return}filmRevisionBusy=true;
 try{const r=await fetch('/api/film/'+encodeURIComponent(f.run.id)+'/recompose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({changes:[{shotId:s.shotId,cropBottomPercent}]})}),out=await r.json();if(!r.ok)throw Error(out.error);filmRuns.push(out.run);filmMessage='已保存画面整理版本；保留原素材，不重新生成已完成画面。';filmRevision=null;}catch(e){f.error=e.message}finally{filmRevisionBusy=false;renderEdit();}
}\n`;fs.writeFileSync(u,s);
