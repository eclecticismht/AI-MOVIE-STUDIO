import av,sys,json
from pathlib import Path
from PIL import Image,ImageDraw
run_id=sys.argv[1]
if not run_id.startswith('film_') or not run_id[5:].isalnum(): raise ValueError('Invalid film ID')
directory=Path('film-runs')/run_id
plan=json.loads((directory/'run.json').read_text(encoding='utf-8'))
indices=[int(x) for x in sys.argv[2:]] or list(range(len(plan['shots'])))
for index in indices:
    source=directory/f'source-{index}.mp4'
    if not source.exists(): continue
    with av.open(str(source)) as c:
        frames=list(c.decode(video=0))
    count=min(12,len(frames)); chosen=[round(i*(len(frames)-1)/(count-1)) for i in range(count)]
    sheet=Image.new('RGB',(432*3,264*4),'#161b23');draw=ImageDraw.Draw(sheet)
    for j,f in enumerate(chosen):
        x,y=(j%3)*432,(j//3)*264
        sheet.paste(frames[f].to_image().resize((432,240)),(x,y+24))
        draw.text((x+8,y+6),f'{index+1}: {frames[f].time:.2f}s',fill='white')
    dest=Path('test-artifacts')/f'{run_id}-shot-{index+1}.jpg';sheet.save(dest)
    print(str(dest))
