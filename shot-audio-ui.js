async function importShotAmbience(input,target){
 const status=document.getElementById(target+'_status'),field=document.getElementById(target),revision=target==='filmRevisionAudioAsset'?filmRevision:null;
 try{const file=input.files[0];if(!file)return;if(file.size>20*1024*1024||!/[.](wav|mp3)$/i.test(file.name))throw Error('请选择20MB以内的WAV或MP3');status.textContent='正在导入并检查音频…';
 const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});
 const dataUrl=data.replace(/^data:[^;]*;/,'data:audio/'+(/mp3$/i.test(file.name)?'mpeg':'wav')+';');
 const r=await fetch('/api/audio-assets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataUrl})}),out=await r.json();if(!r.ok)throw Error(out.error);
 if(document.getElementById(target)!==field||revision&&filmRevision!==revision)return;field.value=out.file;if(revision)revision.audioAsset=out.file;
 status.textContent='已导入：'+file.name+'。保存后生效，请试听并核对所选声音模式。';
 }catch(e){status.textContent=e.message}
}

function reuseShotAmbienceControl(shot){
 const choices=new Map();for(const s of D.shots.filter(s=>s.projectId===shot.projectId&&s.audioAsset&&s.audioMode==='replacement'))if(!choices.has(s.audioAsset))choices.set(s.audioAsset,s.scene||'项目环境音');
 return choices.size?`<label>复用已导入的项目环境音<select onchange="if(this.value){document.getElementById('board_audioAsset').value=this.value;document.getElementById('board_audioMode').value='replacement';document.getElementById('board_audioAsset_status').textContent='已选择项目环境音，保存后生效';}"><option value="">选择已有环境音</option>${[...choices].map(([file,name])=>`<option value="${esc(file)}">${esc(name)}</option>`).join('')}</select></label>`:'';
}
