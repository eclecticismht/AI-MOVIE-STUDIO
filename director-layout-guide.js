// Geometric conditioning guide from a saved director plan. Not a photorealistic frame.
(function(root){
 'use strict';
 const P=typeof module!=='undefined'&&module.exports?require('./director-previs-model'):root.DirectorPrevis;
 const dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]),unit=a=>{const n=Math.hypot(...a);if(n<1e-8)throw Error('Invalid view vector');return a.map(x=>x/n);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 function geometry(plan,{width=1024,height=576,phase=0,eyeHeight=1.65,targetHeight=1.0}={}){
  P.validateSpace(plan.space);if(![width,height].every(x=>Number.isInteger(x)&&x>=256&&x<=1536&&x%16===0)||width*height>1572864)throw Error('参考图尺寸须为16的整数倍，256—1536，总像素不超过150万');
  if(![phase,eyeHeight,targetHeight,plan.camera?.fov].every(Number.isFinite)||plan.camera.fov<20||plan.camera.fov>110)throw Error('Camera and projection parameters invalid');
  const c=P.cameraAt(plan,phase),eye=[c.x,c.y,eyeHeight],target=[c.targetX,c.targetY,targetHeight],forward=unit(sub(target,eye)),right=unit(cross([0,0,1],forward)),up=cross(forward,right),f=width/(2*Math.tan(plan.camera.fov*Math.PI/360));
  function project(v){const rel=sub(v,eye),depth=dot(rel,forward);return {x:width/2+dot(rel,right)*f/depth,y:height/2-dot(rel,up)*f/depth,depth};}
  const faces=[];
  function face(vertices,color){const points=vertices.map(project);if(points.some(p=>p.depth<.1))return;faces.push({points,color,depth:points.reduce((n,p)=>n+p.depth,0)/points.length});}
  function box(x,y,z,w,d,h,colors=['#68777c','#879399','#b9c5c8']){const v=[[x-w/2,y-d/2,z],[x+w/2,y-d/2,z],[x+w/2,y+d/2,z],[x-w/2,y+d/2,z],[x-w/2,y-d/2,z+h],[x+w/2,y-d/2,z+h],[x+w/2,y+d/2,z+h],[x-w/2,y+d/2,z+h]];for(const [i,ids] of [[0,[0,1,5,4]],[0,[1,2,6,5]],[1,[2,3,7,6]],[1,[3,0,4,7]],[2,[4,5,6,7]]])face(ids.map(j=>v[j]),colors[i]);}
  const s=plan.space,W=s.width,D=s.depth,H=2.75;
  face([[0,0,0],[W,0,0],[W,D,0],[0,D,0]],'#29383f');
  face([[0,0,0],[0,D,0],[0,D,H],[0,0,H]],'#50666e');
  face([[0,0,0],[0,0,H],[W,0,H],[W,0,0]],'#607078');
  face([[0,D,0],[W,D,0],[W,D,H],[0,D,H]],'#53646e');
  // Structural ribs establish scale without adding legible text or reference labels.
  for(let y=.3;y<D;y+=1.05)box(.075,y,0,.12,.1,H,['#6f7d82','#8d979a','#9ba7aa']);
  for(const q of s.fixtures){
   if(q.kind==='table'){box(q.x,q.y,.74,q.w,q.h,.09,['#55636b','#64747b','#c3c7c5']);box(q.x,q.y,.0,.38,.5,.74,['#3c4b52','#51616a','#708087']);}
   else if(q.kind==='chair'){box(q.x,q.y,.36,q.w,q.h,.12,['#283840','#39474d','#4b5a60']);}
   else if(q.kind==='screen')box(q.x,q.y,1.15,q.w,q.h,.8,['#10191f','#10191f','#25343c']);
   else if(q.kind==='door')box(q.x,q.y,.0,q.w,q.h,2.3,['#263c47','#2e4651','#536570']);
  }
  return {width,height,faces:faces.sort((a,b)=>b.depth-a.depth),project,eye,planSpaceId:s.id,notPhotorealistic:true};
 }
 function svg(plan,options){const g=geometry(plan,options),polys=g.faces.map(x=>'<polygon points="'+x.points.map(p=>p.x.toFixed(2)+','+p.y.toFixed(2)).join(' ')+'" fill="'+x.color+'" stroke="#26363e" stroke-width="1.2"/>').join('');return '<svg xmlns="http://www.w3.org/2000/svg" width="'+g.width+'" height="'+g.height+'" viewBox="0 0 '+g.width+' '+g.height+'"><rect width="'+g.width+'" height="'+g.height+'" fill="#354b57"/>'+polys+'</svg>';}
 const api={geometry,svg};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DirectorLayoutGuide=api;
})(typeof globalThis!=='undefined'?globalThis:this);
