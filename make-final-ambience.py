from pathlib import Path
import numpy as np, wave, json
root=Path('test-artifacts/final-audio');root.mkdir(exist_ok=True)
plan=json.loads(Path('film-runs/film_e9841cda36195862/run.json').read_text(encoding='utf-8'))
rng=np.random.default_rng(20092026);rate=48000
for index in [13,16,23,43,45,67,81,83,97,99]:
 seconds=plan['shots'][index-1]['duration'];t=np.arange(int(rate*seconds))/rate
 noise=rng.normal(size=len(t));low=np.convolve(noise,np.ones(180)/180,mode='same')
 site=index in (13,16,67)
 audio=(.09 if site else .018)*low+(.006 if site else .001)*np.sin(2*np.pi*58*t)
 if index==13:
  mask=(t>.45)&(t<1.6);env=np.sin(np.pi*np.clip((t-.45)/1.15,0,1))**.4
  audio+=.12*np.sin(2*np.pi*(2450*t+3*np.sin(2*np.pi*8*t)))*env*mask
 if index==16:
  for start in [.7,1.35]:
   dt=t-start;env=np.sin(np.pi*np.clip(dt/.35,0,1))**2*((dt>0)&(dt<.35));audio+=.04*env*np.sin(2*np.pi*130*t)
 if index==67:
  for start in [1,1.6,2.3]:
   dt=np.maximum(t-start,0);audio+=.1*noise*np.exp(-dt*100)*(t>=start)
 if index in (23,45,81):
  for start in np.arange(.45,seconds-.3,.7):
   dt=np.maximum(t-start,0);audio+=.035*low*np.exp(-dt*15)*(t>=start)
 fade=np.minimum(np.minimum(t/.1,(seconds-t)/.1),1).clip(0,1);audio*=fade
 with wave.open(str(root/f'shot-{index}.wav'),'wb') as f:
  f.setnchannels(2);f.setsampwidth(2);f.setframerate(rate);f.writeframes((np.stack([audio,audio*.96],axis=1).clip(-1,1)*32767).astype('<i2').tobytes())
print('Generated 10 speech-free ambience tracks with whistle, vibration and lighter cues preserved.')
