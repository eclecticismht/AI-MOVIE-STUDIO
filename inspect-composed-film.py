"""Create time-labelled review sheets from the delivered movie, not source clips."""
import av,json,sys
from pathlib import Path
from PIL import Image,ImageDraw
run_id=sys.argv[1]
if not(run_id.startswith('film_') and len(run_id)==21 and all(c in '0123456789abcdef' for c in run_id[5:])):raise ValueError('Invalid ID')
root=Path('film-runs')/run_id
run=json.loads((root/'run.json').read_text(encoding='utf-8'))
assert run['status']=='complete'
targets=[];elapsed=0
for n,s in enumerate(run['shots'],1):
    duration=(17*int((s['duration']*24-5)/17+0.5)+5)/24
    targets.append((n,elapsed+duration/2))
    elapsed+=duration
with av.open(str(root/'movie.mp4')) as container:
    stream=container.streams.video[0]
    for base in range(0,len(targets),12):
        sheet=Image.new('RGB',(1440,1160),'#161b23');draw=ImageDraw.Draw(sheet)
        for j,(n,time) in enumerate(targets[base:base+12]):
            container.seek(int(time/stream.time_base),stream=stream)
            chosen=None
            for frame in container.decode(video=0):
                chosen=frame
                if frame.time>=time:break
            if chosen is None:raise RuntimeError(f'No frame at {time}')
            x=(j%3)*480;y=(j//3)*290
            sheet.paste(chosen.to_image().resize((480,270)),(x,y+20))
            draw.text((x+5,y+3),f'Shot {n} - movie {chosen.time:.2f}s',fill='white')
        dest=Path('test-artifacts')/f'{run_id}-composed-{base+1}.jpg'
        sheet.save(dest);print(dest)
