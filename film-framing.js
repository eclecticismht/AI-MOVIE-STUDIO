function validateBottomCrop(value=0){
 if(!Number.isFinite(value)||value<0||value>20)throw Error('底部裁切须为 0–20%');
 return value;
}
function cropFilter(value){
 const percent=validateBottomCrop(value);
 return `crop=iw:trunc(ih*${1-percent/100}/2)*2:0:0,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
}
function compositionFile(shot,index){return `${shot.cropBottomPercent>0?'framed':shot.audioMode&&shot.audioMode!=='model'?'sound':'clip'}-${index}.mp4`;}
module.exports={validateBottomCrop,cropFilter,compositionFile};
