"""Independent offline Chinese recognition, never supplied with expected dialogue."""
import sys,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'.runtime'/'sensevoice'))
import numpy as np
import sherpa_onnx
sys.path.insert(0,str(ROOT/'.runtime'/'asr'))
from pypinyin import lazy_pinyin,Style
from opencc import OpenCC
import unicodedata
converter=OpenCC('t2s')
def phones(text):
    clean=''.join(c for c in unicodedata.normalize('NFKC',converter.convert(text)) if not c.isspace() and unicodedata.category(c)[0] not in ('P','Z')).lower()
    return lazy_pinyin(clean,style=Style.TONE3,neutral_tone_with_five=True)
files=sys.argv[1:];expected=None
if files[:1]==['--expected']:
    expected=files[1];files=files[2:]
model=ROOT/'.runtime'/'models'/'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17'
recognizer=sherpa_onnx.OfflineRecognizer.from_sense_voice(model=str(model/'model.int8.onnx'),tokens=str(model/'tokens.txt'),num_threads=4,use_itn=False,language='zh')
ffmpeg=r'C:\AI\Comfy UI\ComfyUI\.venv\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe'
results=[]
for file in files:
    raw=subprocess.check_output([ffmpeg,'-hide_banner','-loglevel','error','-i',file,'-vn','-ac','1','-ar','16000','-f','f32le','pipe:1'])
    audio=np.frombuffer(raw,dtype=np.float32)
    stream=recognizer.create_stream();stream.accept_waveform(16000,audio);recognizer.decode_stream(stream)
    results.append({'file':file,'text':stream.result.text,'tokens':stream.result.tokens,'timestamps':stream.result.timestamps,'duration':len(audio)/16000})
    if expected is not None:
        results[-1].update(expectedPhonemes=phones(expected),phonemes=phones(stream.result.text))
sys.stdout.buffer.write(json.dumps(results,ensure_ascii=False).encode('utf-8'))
