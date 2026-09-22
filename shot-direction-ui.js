// Shot-local direction is saved with the normal editor and invalidates linked successors.
function readCharacterPositions(){
 return Object.fromEntries([...document.querySelectorAll('[data-character-position]')].filter(e=>e.value).map(e=>[e.dataset.characterPosition,e.value]));
}
const renderBeforeShotDirection=renderShots2;
renderShots2=function(){
 renderBeforeShotDirection();
 const shot=D.shots.find(s=>s.id===editingShotId&&s.projectId===D.activeProjectId),audio=document.getElementById('board_audioMode');
 if(!shot||!audio)return;
 audio.closest('label').parentElement.classList.add('shot-direction-editor');
 audio.closest('label').insertAdjacentHTML('beforebegin',`<section class="shot-direction-panel"><h3>声音设计</h3><p>每镜生成环境声与动作音效；对白沿用“对白与声音”中的人物和原句。生成后需试听核对。</p><label>本镜音效<textarea id="board_soundscape" rows="3" placeholder="自动根据画面生成环境声和同步动作声；可填写具体要求，如街头车流、电动车减速、脚步。">${esc(shot.soundscape||'')}</textarea></label></section>`);
 const anchor=document.getElementById('board_firstFrameSpeakerPosition');
 anchor.closest('label').insertAdjacentHTML('beforebegin',`<section class="shot-direction-panel"><h3>人物身份与站位</h3><p>多人画面请分别设置站位，并核对生成首帧的脸、服装和左右关系。站位按观众视角；人物交叉移动时，应在画面描述中写明。自动精修不会把一人的脸套给所有人。</p>${(D.characters||[]).filter(c=>c.projectId===shot.projectId).map(c=>`<label>${esc(c.name)}<select data-character-position="${esc(c.id)}"><option value="">未指定 / 本镜未出场</option>${[['left','左侧'],['center','中央'],['right','右侧'],['background','后景']].map(([v,t])=>`<option value="${v}" ${shot.characterPositions?.[c.id]===v?'selected':''}>${t}</option>`).join('')}</select></label>`).join('')}<p>仅本镜已引用角色会传入视频生成；更改站位后请重新生成并核对首帧。</p></section>`);
 const continuity=document.getElementById('board_continueFromShotId');
 if(continuity){continuity.closest('label').classList.add('shot-continuity-control');continuity.closest('label').insertAdjacentHTML('beforebegin','<h3>段间引导 · 尾帧承接</h3>');}
};
