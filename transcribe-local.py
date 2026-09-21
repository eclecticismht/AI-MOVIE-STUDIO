"""Offline transcription. Dependencies and model stay inside this workspace."""
import json
import os
import sys
import subprocess
import tempfile
import unicodedata

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, '.runtime', 'asr'))
from faster_whisper import WhisperModel
from opencc import OpenCC
from pypinyin import lazy_pinyin, Style
converter = OpenCC('t2s')

model_name = sys.argv[3] if len(sys.argv) > 3 else 'small'
if model_name not in ('small', 'medium', 'large-v3'):
    raise ValueError('Unsupported local model')
model = WhisperModel(os.path.join(ROOT, '.runtime', 'models', 'whisper-' + model_name),
                     device='cpu', compute_type='int8', local_files_only=True, cpu_threads=4)
def rows(segments):
    return [
    {'start': s.start, 'end': s.end, 'text': s.text, 'normalizedText': converter.convert(s.text), 'noSpeechProbability': s.no_speech_prob}
    for s in segments]
def normalized(text):
    return ''.join(c for c in unicodedata.normalize('NFKC', converter.convert(text)) if not c.isspace() and unicodedata.category(c)[0] not in ('P','Z')).lower()

segments, info = model.transcribe(sys.argv[1], language='zh', beam_size=5,
                                  vad_filter=True, condition_on_previous_text=False)
expected=sys.argv[2] if len(sys.argv)>2 else ''
result = {'model': 'whisper-' + model_name, 'language': info.language, 'normalizedExpected': converter.convert(expected), 'segments': rows(segments), 'method':'vad'}
# A quiet phone loudspeaker may be discarded by VAD. Recheck actual audio,
# without supplying the script as an ASR prompt, before calling it missing.
if expected and normalized(''.join(s['text'] for s in result['segments'])) != normalized(expected):
    ffmpeg=os.environ.get('FFMPEG_PATH', r'C:\AI\Comfy UI\ComfyUI\.venv\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe')
    try:
        with tempfile.TemporaryDirectory(prefix='ams-speech-check-') as tmp:
            audio=os.path.join(tmp,'normalized.wav')
            subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-i',sys.argv[1],'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=11','-ar','16000',audio],check=True,capture_output=True,timeout=90)
            retry,_=model.transcribe(audio,language='zh',beam_size=5,vad_filter=False,condition_on_previous_text=False)
            result['alternatives']=[{'method':'normalized-no-vad','segments':rows(retry)}]
    except Exception as error:
        result['recheckError']=str(error)
def phones(text):
    return lazy_pinyin(normalized(text), style=Style.TONE3, neutral_tone_with_five=True)
result['expectedPhonemes']=phones(expected)
result['phonemes']=phones(''.join(s['text'] for s in result['segments']))
for alternative in result.get('alternatives', []):
    alternative['phonemes']=phones(''.join(s['text'] for s in alternative['segments']))
sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
