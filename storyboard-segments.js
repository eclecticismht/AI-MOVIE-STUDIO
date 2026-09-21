(function(root){
 function split(text,timing){
  const starts=[...text.matchAll(/^第[0-9一二三四五六七八九十百]+场[^\n]*/gm)].map(m=>m.index);
  if(text.length<2000||starts.length<2)return [{text,timing}];
  starts[0]=0;const parts=starts.map((start,i)=>text.slice(start,starts[i+1]??text.length).trim());
  const total=parts.reduce((n,s)=>n+s.length,0);let allotted=0;
  return parts.map((part,i)=>{const seconds=timing.mode==='target'?(i===parts.length-1?timing.targetSeconds-allotted:Math.round(timing.targetSeconds*part.length/total)):0;allotted+=seconds;return {text:part,timing:timing.mode==='target'?{mode:'target',targetSeconds:Math.max(6,seconds)}:timing};});
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={split};else root.StoryboardSegments={split};
})(typeof globalThis!=='undefined'?globalThis:this);
