(function(root){
 function split(text,timing){
  const starts=[...text.matchAll(/^第[0-9一二三四五六七八九十百]+场[^\n]*/gm)].map(m=>m.index);
  if(text.length<2000||starts.length<2)return [{text,timing}];
  starts[0]=0;const parts=starts.map((start,i)=>text.slice(start,starts[i+1]??text.length).trim());
  const total=parts.reduce((n,s)=>n+s.length,0);let allotted=0;
  return parts.map((part,i)=>{const seconds=timing.mode==='target'?(i===parts.length-1?timing.targetSeconds-allotted:Math.round(timing.targetSeconds*part.length/total)):0;allotted+=seconds;return {text:part,timing:timing.mode==='target'?{mode:'target',targetSeconds:Math.max(6,seconds)}:timing};});
 }
 // Split only at a paragraph boundary, retaining a scene heading as context.
 function bisect(part){
  if((part.depth||0)>=4||part.text.length<180||/一镜到底|不切镜/.test(part.text))return [];
  const match=/^第[0-9一二三四五六七八九十百]+场[^\n]*\n/.exec(part.text),heading=match?.[0]||'',body=part.text.slice(heading.length);
  const boundaries=[...body.matchAll(/\n\s*\n/g)].map(m=>m.index+m[0].length).filter(i=>i>=50&&body.length-i>=50);if(!boundaries.length)return [];
  const middle=boundaries.sort((a,b)=>Math.abs(a-body.length/2)-Math.abs(b-body.length/2))[0];
  return [body.slice(0,middle).trim(),body.slice(middle).trim()].map(text=>({...part,text:heading+text,depth:(part.depth||0)+1}));
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={split,bisect};else root.StoryboardSegments={split,bisect};
})(typeof globalThis!=='undefined'?globalThis:this);
