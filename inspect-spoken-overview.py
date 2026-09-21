import av,json,sys
from pathlib import Path
from PIL import Image,ImageDraw
run_id=sys.argv[1]
directory=Path('film-runs')/run_id
run=json.loads((directory/'run.json').read_text(encoding='utf-8'))
shots=[(i,s) for i,s in enumerate(run['shots']) if s.get('ready') and any(e['type']=='speech' for e in s.get('dialogueEvents',[]))]
for start in range(0,len(shots),6):
    group=shots[start:start+6];sheet=Image.new('RGB',(1296,264*len(group)),'#161b23');draw=ImageDraw.Draw(sheet)
    for row,(i,s) in enumerate(group):
        with av.open(str(directory/f'source-{i}.mp4')) as c: frames=list(c.decode(video=0))
        for col,fraction in enumerate([.3,.55,.8]):
            f=frames[round((len(frames)-1)*fraction)];x=col*432;y=row*264
            sheet.paste(f.to_image().resize((432,240)),(x,y+24));draw.text((x+8,y+6),f'{i+1}: {f.time:.2f}s',fill='white')
    output=Path('test-artifacts')/f'{run_id}-spoken-{start+1}.jpg';sheet.save(output);print(output)
