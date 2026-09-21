const fs=require('fs');const {buildGraph}=require('./local-first-frame');
(async()=>{
 const original=JSON.parse(fs.readFileSync('frame-runs/frame_a3dc3209bad0b570.json'));const [a,b,scene]=original.plan.references;
 const plan={...original.plan,references:[scene,a],width:1024,height:576};const graph=buildGraph(plan,0,null,'frame_pair_test');
 graph['16']={class_type:'LoadImage',inputs:{image:b.file}};
 graph['17']={class_type:'ImageStitch',inputs:{image1:['7',0],image2:['16',0],direction:'right',match_image_size:true,spacing_width:0,spacing_color:'white'}};
 graph['8'].inputs.pixels=['17',0];graph['10'].inputs.source_image_b=['17',0];graph['11'].inputs.image_b=['17',0];graph['12'].inputs.image_b=['17',0];
 graph['11'].inputs.prompt=`Place the two students shown together in Image B into the shop location in Image A. Preserve exactly their faces and distinct tracksuits. The left boy has white sleeves with two blue stripes. The right boy has dark blue sleeves and a horizontal white chest stripe. Keep left/right identities separate. One coherent cinematic medium two-shot, no collage, no panel division, no studio background. The boys face each other at the shop window in warm evening light. The left boy reluctantly holds a small banknote near his waist; the right boy waits, hands lowered. Bare hands. No added gloves, emblems or text. Their jackets must stay identical to Image B, without copying the left jacket onto the right boy.`;
 const response=await fetch('http://127.0.0.1:8188/prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:graph,client_id:'ams-pair-test'})}),out=await response.json();if(!response.ok)throw Error(JSON.stringify(out));fs.writeFileSync('test-artifacts/local-frame-pair.json',JSON.stringify({promptId:out.prompt_id,graph},null,2));console.log(out.prompt_id);
})().catch(e=>{console.error(e.message);process.exitCode=1});
