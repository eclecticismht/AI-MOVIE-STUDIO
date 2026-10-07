function validateBottomCrop(value=0){
 if(!Number.isFinite(value)||value<0||value>20)throw Error('底部裁切须为 0–20%');
 return value;
}
function validateCropAspect(value='pad'){if(!['pad','fill'].includes(value))throw Error('裁切画面适配方式须为保留全宽或填满画面');return value;}
function cropFilter(value,aspectMode='pad'){
 const percent=validateBottomCrop(value);validateCropAspect(aspectMode);
 if(aspectMode==='fill')return `crop=trunc(ih*${1-percent/100}*16/9/2)*2:trunc(ih*${1-percent/100}/2)*2:(iw-ow)/2:0,scale=1280:720,setsar=1`;
 return `crop=iw:trunc(ih*${1-percent/100}/2)*2:0:0,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
}
function compositionFile(shot,index){return `${shot.cropBottomPercent>0?'framed':shot.audioMode&&shot.audioMode!=='model'?'sound':'clip'}-${index}.mp4`;}
module.exports={validateBottomCrop,validateCropAspect,cropFilter,compositionFile};
