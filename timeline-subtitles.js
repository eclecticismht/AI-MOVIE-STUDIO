const {makeAss}=require('./film-api');

function filmReference(value){
 const url=new URL(value,'http://127.0.0.1:4173');
 if(url.origin!=='http://127.0.0.1:4173'||url.username||url.password||url.hash)return null;
 const preview=/^\/api\/film\/(film_[a-f0-9]+)\/preview$/.exec(url.pathname);
 if(preview&&/^\d{1,4}$/.test(url.searchParams.get('index')||''))return {runId:preview[1],index:Number(url.searchParams.get('index'))};
 const clip=/^\/film-runs\/(film_[a-f0-9]+)\/clip-(\d{1,4})\.mp4$/.exec(url.pathname);
 return clip&&!url.search?{runId:clip[1],index:Number(clip[2])}:null;
}

function sourceShot(clip,readRun){
 const ref=filmReference(clip.url);if(!ref)return null;
 const shot=readRun(ref.runId)?.shots?.[ref.index];
 if(!shot||shot.shotId!==clip.shotId)throw Error('剪辑素材与原分镜字幕不匹配，请重新同步素材。');
 return shot;
}

function seconds(value){
 const match=/^(\d+):(\d{2}):(\d{2})\.(\d{2})$/.exec(value);
 if(!match)throw Error('字幕时间无效');
 return Number(match[1])*3600+Number(match[2])*60+Number(match[3])+Number(match[4])/100;
}
function assTime(value){
 const c=Math.round(Math.max(0,value)*100);
 return Math.floor(c/360000)+':'+String(Math.floor(c/6000)%60).padStart(2,'0')+':'+String(Math.floor(c/100)%60).padStart(2,'0')+'.'+String(c%100).padStart(2,'0');
}

// Source caption times follow trims and the new order. During a transition,
// switch captions at its midpoint so outgoing and incoming text never pile up.
function timelineAss(clips,shots){
 const events=[];let offset=0;
 clips.forEach((clip,index)=>{
  offset-=clip.overlap||0;
  const shot=shots[index],from=clip.trimIn+(clip.overlap||0)/2,to=clip.trimOut-(clips[index+1]?.overlap||0)/2;
  if(shot){
   const ass=makeAss([{...shot,actualDuration:clip.sourceDuration}]);
   for(const line of ass.split('\n')){
    const match=/^Dialogue: ([^,]*),([^,]*),([^,]*),(.*)$/.exec(line);if(!match)continue;
    const start=Math.max(from,seconds(match[2])),end=Math.min(to,seconds(match[3]));
    if(end<=start)continue;
    const a=assTime(offset+start-clip.trimIn),b=assTime(offset+end-clip.trimIn);
    if(a!==b)events.push('Dialogue: '+match[1]+','+a+','+b+','+match[4]);
   }
  }
  offset+=clip.duration;
 });
 return {ass:makeAss([])+events.join('\n')+'\n',cueCount:events.length};
}

module.exports={filmReference,sourceShot,timelineAss};
