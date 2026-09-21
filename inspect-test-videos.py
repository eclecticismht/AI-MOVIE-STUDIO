import av,json
from PIL import Image,ImageDraw
from pathlib import Path
root=Path(r'C:\AI\Comfy UI\ComfyUI\output\AI_MOVIE_STUDIO')
out=Path('test-artifacts');out.mkdir(exist_ok=True)
for p in root.glob('JOB_mu4c*.mp4'):
 c=av.open(str(p));v=c.streams.video[0];audio=c.streams.audio
 sheet=Image.new('RGB',(432*3,260),'#151a23');draw=ImageDraw.Draw(sheet);wanted=[0,60,120]
 for i,frame in enumerate(c.decode(video=0)):
  if i in wanted:
   n=wanted.index(i);sheet.paste(frame.to_image().resize((432,240)),(n*432,20));draw.text((n*432+8,3),f'frame {i}',fill='white')
 c.close();sheet.save(out/(p.stem+'.jpg'))
 print(json.dumps({'file':str(p),'width':v.width,'height':v.height,'fps':str(v.average_rate),'frames':i+1,'audio':len(audio)},ensure_ascii=False))
