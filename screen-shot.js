function validateScreenShot(shot,references){
 if(shot.renderMode!=='screen')return undefined;
 if(shot.firstFrame||shot.continueFromShotId||shot.dialogueEvents?.some(e=>e.type==='speech'))throw Error('屏幕资产展示不能含口头对白、首帧或尾帧承接');
 const ref=references.find(r=>r.assetId===shot.screenAssetId);
 if(!ref||!['prop','props'].includes(ref.kind))throw Error('请选择已引用的屏幕道具图片');
 const percent=shot.screenImagePercent??100;
 const source=shot.screenSource||'image';if(!['image','text'].includes(source))throw Error('屏幕展示来源无效');
 if(!Number.isFinite(percent)||percent<20||percent>100)throw Error('屏幕图片展示高度须为 20–100%');
 return {screenAssetId:ref.assetId,screenImagePercent:source==='text'?100:percent,screenSource:source};
}
function screenImageFilter(percent){
 if(!Number.isFinite(percent)||percent<20||percent>100)throw Error('屏幕图片展示高度无效');
 return `crop=iw:trunc(ih*${percent/100}/2)*2:0:0,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x181b20,setsar=1`;
}
module.exports={validateScreenShot,screenImageFilter};
