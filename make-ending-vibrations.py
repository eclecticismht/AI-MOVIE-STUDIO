"""Two precisely timed nonverbal phone vibrations for the original quiet ending."""
from pathlib import Path
import numpy as np,wave
rate=48000;seconds=6;t=np.arange(rate*seconds)/rate
rng=np.random.default_rng(982026)
noise=rng.normal(size=len(t));room=.015*np.convolve(noise,np.ones(180)/180,mode='same')+.0008*np.sin(2*np.pi*58*t)
audio=room
for start in [1.1,3.3]:
    dt=t-start;mask=(dt>=0)&(dt<.38);env=np.sin(np.pi*np.clip(dt/.38,0,1))**1.5*mask
    audio+=env*(.065*np.sin(2*np.pi*135*t)+.02*np.sin(2*np.pi*270*t)+.006*noise)
audio*=np.minimum(np.minimum(t/.08,(seconds-t)/.12),1).clip(0,1)
target=Path('test-artifacts/final-audio/shot-98.wav')
with wave.open(str(target),'wb') as output:
    output.setnchannels(2);output.setsampwidth(2);output.setframerate(rate)
    output.writeframes((np.stack([audio,audio],axis=1)*32767).clip(-32768,32767).astype('<i2').tobytes())
print(target)
