"""Extract actual composed frames, including timed draft overlays, for review."""
import json, sys
from pathlib import Path
import av
from PIL import Image, ImageDraw

run_id = sys.argv[1]
if not run_id.startswith('film_') or not run_id[5:].isalnum():
    raise ValueError('Invalid film ID')
directory = Path('film-runs') / run_id
plan = json.loads((directory / 'run.json').read_text(encoding='utf-8'))
video = directory / 'movie.mp4'
if not video.exists():
    raise FileNotFoundError(video)
targets, elapsed = [], 0
for index, shot in enumerate(plan['shots']):
    duration = (17 * round((shot['duration'] * 24 - 5) / 17) + 5) / 24
    if shot.get('renderMode') == 'screen':
        samples = [1, 3.3, 5.2, 8.1, 10.5, 13.6, duration - .15] if any(c.get('effect') for c in shot.get('screenCards', [])) else [duration / 2]
        targets.extend((elapsed + t, index + 1, t) for t in samples if t < duration)
    elapsed += duration
sheet = Image.new('RGB', (1280, ((len(targets) + 1) // 2) * 384), '#161b23')
draw = ImageDraw.Draw(sheet)
with av.open(str(video)) as container:
    iterator = iter(container.decode(video=0))
    frame = next(iterator)
    for j, (target, index, within) in enumerate(targets):
        while frame.time < target:
            frame = next(iterator)
        x, y = (j % 2) * 640, (j // 2) * 384
        draw.text((x + 8, y + 5), f'Shot {index}, {within:.2f}s', fill='white')
        sheet.paste(frame.to_image().resize((640, 360)), (x, y + 24))
dest = Path('test-artifacts') / f'{run_id}-composed-screens.jpg'
sheet.save(dest)
print(dest)
