(function(root){
 // Change detection only, not an authentication or security signature.
 function imageIdentity(value){const text=String(value||'');if(text.length<2048)return text;let h=2166136261,k=2246822519;for(let i=0;i<text.length;i++){h=Math.imul(h^text.charCodeAt(i),16777619);k=Math.imul(k^text.charCodeAt(i),3266489917);}return `image:${text.length}:${h>>>0}:${k>>>0}`;}
 function snapshot(shot,assets){return JSON.stringify({version:1,projectId:shot.projectId,shotId:shot.id,visual:shot.visual||shot.desc||'',script:shot.script||'',camera:shot.camera||'',intent:shot.firstFrameIntent||'',renderMode:shot.renderMode||'model',assets:assets.map(a=>({assetId:a.assetId,kind:a.kind,name:a.name,notes:a.notes||'',image:imageIdentity(a.imageUrl)}))});}
 function create(shot,assets,imageUrl){return {imageUrl,snapshot:snapshot(shot,assets)};}
 function reconcileSpeaker(previous,next,previousEvents,nextEvents){const id=events=>(events||[]).filter(e=>e.type==='speech'&&e.delivery==='onscreen').map(e=>e.speakerId).join('|');return previous.firstFrameUrl===next.firstFrameUrl&&previous.firstFrameSpeakerPosition===next.firstFrameSpeakerPosition&&id(previousEvents)!==id(nextEvents)?'':next.firstFrameSpeakerPosition;}
 function validate(shot,assets){if(!shot.firstFrameUrl||!shot.firstFrameProvenance)return;const p=shot.firstFrameProvenance;if(p.imageUrl!==shot.firstFrameUrl||p.snapshot!==snapshot(shot,assets))throw Error('首帧已过期：画面、行动或引用资产已修改，请重新生成并确认首帧，或清除首帧后使用资产参考模式。');}
 const api={snapshot,create,validate,reconcileSpeaker};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FrameProvenance=api;
})(typeof globalThis!=='undefined'?globalThis:this);
