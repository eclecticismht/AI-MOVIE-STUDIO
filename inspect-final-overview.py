from pathlib import Path
import av
from PIL import Image,ImageDraw
root=Path('film-runs/film_e17331fb07f8f361')
for base in range(0,99,20):
 sheet=Image.new('RGB',(1280,1000),'#151515');d=ImageDraw.Draw(sheet)
 for i in range(base,min(base+20,99)):
  with av.open(str(root/f'source-{i}.mp4')) as c:
   v=c.streams.video[0];target=(v.duration or 0)//2;c.seek(target,stream=v);frame=next(c.decode(video=0))
   x=((i-base)%4)*320;y=((i-base)//4)*200;sheet.paste(frame.to_image().resize((320,180)),(x,y+20));d.text((x+5,y+3),str(i+1),fill='white')
 path=Path('test-artifacts')/f'final-overview-{base+1}.jpg';sheet.save(path);print(path)
