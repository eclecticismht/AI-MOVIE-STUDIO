(function(root){
 function draw(canvas,text,{balance=false,typing=false}={}){
  canvas.width=1280;canvas.height=720;const c=canvas.getContext('2d');
  c.fillStyle='#111820';c.fillRect(0,0,1280,720);
  c.fillStyle='#eaf0f4';c.font='36px "Microsoft YaHei", sans-serif';c.fillText(typing?'编辑消息':balance?'账户余额':'消息',140,125);
  c.fillStyle='#8c9ba8';c.font='22px "Microsoft YaHei", sans-serif';if(typing)c.fillText('未发送',140,170);
  c.strokeStyle='#34424e';c.lineWidth=2;c.beginPath();c.moveTo(140,198);c.lineTo(1140,198);c.stroke();
  if(typing){c.fillStyle='#1d2933';c.fillRect(140,255,1000,350);return;}
  const paragraphs=String(text).split('\n').filter(Boolean);let y=275;
  for(const paragraph of paragraphs){
   const isAmount=/^(?:余额页[:：]\s*)?\d+\.\d{2}(?:元)?$/.test(paragraph);
   c.font=`${isAmount?52:34}px "Microsoft YaHei", sans-serif`;c.fillStyle=isAmount?'#a8d9c1':'#eaf0f4';
   let line='';for(const ch of paragraph){if(c.measureText(line+ch).width>940){c.fillText(line,160,y);y+=53;line='';}line+=ch;}c.fillText(line,160,y);y+=isAmount?86:80;
  }
  if(y>700)throw Error('屏幕原文过长，请拆分镜头');
 }
 const api={draw};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ScreenLayout=api;
})(typeof globalThis!=='undefined'?globalThis:this);
