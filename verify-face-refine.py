"""Inspect the bounded installation render; no original media is modified."""
import av,json
from pathlib import Path
from PIL import Image,ImageDraw
root=Path(__file__).parent
h=json.loads((root/'test-artifacts/face-refine-history.json').read_text())
entry=next(iter(h.values()))
assert entry['status']['status_str']=='success'
target=Path(entry['outputs']['23']['gifs'][0]['fullpath'])
source=root/'film-runs/film_6c37d0e6b017be7e/source-2.mp4'
def frames(p):
    with av.open(str(p)) as c:
        return list(c.decode(video=0))
original,refined=frames(source),frames(target)
assert len(refined)==39
sheet=Image.new('RGB',(1152,1050),'#161b23');draw=ImageDraw.Draw(sheet)
for row,i in enumerate([0,19,38]):
    y=row*350
    draw.text((10,y+5),f'Source frame {i}',fill='white')
    draw.text((586,y+5),f'FaceRefine frame {i}',fill='white')
    sheet.paste(original[i].to_image().resize((576,320)),(0,y+25))
    sheet.paste(refined[i].to_image().resize((576,320)),(576,y+25))
sheet.save(root/'test-artifacts/face-refine-comparison.jpg')
with av.open(str(target)) as c:
    assert c.streams.audio
    duration=c.duration/av.time_base
    audio_frames=sum(1 for _ in c.decode(audio=0))
assert audio_frames>0 and abs(duration-39/24)<0.15
report={'pluginVersion':'1.1.2','commit':'d8521d14fe0d721d80cd9417fff5a559cbc21aba','status':'success','frames':39,'duration':duration,'audioFrames':audio_frames,'output':str(target),'scope':'Short installation test; original audio wired through NativeAudioLock, output kept separate. No full-film quality claim.'}
(root/'test-artifacts/face-refine-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
