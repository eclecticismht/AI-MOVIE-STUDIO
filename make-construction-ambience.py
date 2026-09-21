"""Local procedural ambience fixture: machinery, welding hiss and metal impacts, no voices."""
from pathlib import Path
import wave
import numpy as np

rate, seconds = 48000, 12
rng = np.random.default_rng(190926)
t = np.arange(rate * seconds) / rate
noise = rng.standard_normal(t.size)
low = np.convolve(noise, np.ones(120) / 120, mode='same')
audio = .12 * low + .018 * np.sin(2*np.pi*58*t) + .009*np.sin(2*np.pi*116*t)
audio += .007*np.sin(2*np.pi*183*t)*(1+.3*np.sin(2*np.pi*4.1*t))
for start in (1.1, 4.6, 8.7):
    dt = t-start
    envelope = np.where((dt > 0) & (dt < 1.5), np.sin(np.pi*np.clip(dt/1.5,0,1))**2, 0)
    audio += .016*noise*envelope
for start in (.7, 2.7, 3.05, 6.2, 9.9):
    dt = np.maximum(t-start,0)
    envelope = (t >= start)*np.exp(-dt*9)
    audio += .035*envelope*(np.sin(2*np.pi*780*dt)+.35*np.sin(2*np.pi*1391*dt))
fade = np.minimum(np.minimum(t/.2,(seconds-t)/.2),1).clip(0,1)
audio *= fade
stereo = np.stack([audio, .96*audio+.004*np.roll(low,317)*fade],axis=1)
dest=Path('test-artifacts/construction-ambience-procedural.wav')
with wave.open(str(dest),'wb') as out:
    out.setnchannels(2);out.setsampwidth(2);out.setframerate(rate)
    out.writeframes((np.clip(stereo,-1,1)*32767).astype('<i2').tobytes())
print(dest)
