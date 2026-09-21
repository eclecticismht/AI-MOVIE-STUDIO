"""Read-only verification of a completed movie, including full audio/video decoding."""
import av,json,sys,urllib.request
from pathlib import Path
run_id=sys.argv[1]
if not (run_id.startswith('film_') and len(run_id)==21 and all(c in '0123456789abcdef' for c in run_id[5:])):
    raise ValueError('Invalid run ID')
folder=Path('film-runs')/run_id
run=json.loads((folder/'run.json').read_text(encoding='utf-8'))
assert run['status']=='complete','Movie not complete'
assert all(s.get('ready') for s in run['shots']),'Missing shots'
quality={}
for shot in run['shots']:
    status=shot.get('speechCheck',{}).get('status','missing')
    quality[status]=quality.get(status,0)+1
    assert status in ('text_match','pronunciation_match','not_applicable') or shot.get('speechCheck',{}).get('review',{}).get('accepted'), 'Unresolved speech check'
movie=folder/'movie.mp4'
with av.open(str(movie)) as container:
    streams=[{'type':s.type,'codec':s.codec_context.name} for s in container.streams]
    video=container.streams.video[0]
    size=[video.width,video.height]
    duration=container.duration/av.time_base
    counts={'video':0,'audio':0}
    ends={'video':0,'audio':0}
    for packet in container.demux():
        for frame in packet.decode():
            kind=packet.stream.type
            if kind in counts:
                counts[kind]+=1
                if frame.time is not None: ends[kind]=max(ends[kind],float(frame.time))
expected=sum((17*int((s['duration']*24-5)/17+0.5)+5)/24 for s in run['shots'])
assert counts['video']>0 and counts['audio']>0,'Missing audio/video'
assert abs(duration-expected)<2,f'Duration mismatch {duration} vs {expected}'
assert abs(ends['video']-ends['audio'])<0.3,'Audio/video tail mismatch'
url=f'http://127.0.0.1:4173/api/film/{run_id}/video'
with urllib.request.urlopen(urllib.request.Request(url,method='HEAD')) as res:
    assert res.status==200 and int(res.headers['Content-Length'])==movie.stat().st_size
with urllib.request.urlopen(urllib.request.Request(url,headers={'Range':'bytes=0-1023'})) as res:
    assert res.status==206 and len(res.read())==1024
report={'runId':run_id,'shots':len(run['shots']),'durationSeconds':duration,'expectedSeconds':expected,
        'size':size,'streams':streams,'decodedFrames':counts,'streamEnds':ends,'fileBytes':movie.stat().st_size,
        'httpHead':200,'httpRange':206,'qualityChecks':quality,
        'manualAcceptances':sum(bool(s.get('speechCheck',{}).get('review',{}).get('accepted')) for s in run['shots']),
        'note':'Technical delivery checks; not a claim of human listening or perfect visual fidelity.'}
output=Path('test-artifacts')/f'{run_id}-export-verification.json'
output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
