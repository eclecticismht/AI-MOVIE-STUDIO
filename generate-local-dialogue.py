"""Generate speech locally on CPU without competing with the video renderer."""
import os
import sys
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'.runtime'/'tts'))
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
import torch
import soundfile as sf
from qwen_tts import Qwen3TTSModel
torch.set_num_threads(4)
request=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
model=Qwen3TTSModel.from_pretrained(str(ROOT/'.runtime'/'models'/'qwen3-tts-customvoice'),device_map='cpu',dtype=torch.float32,attn_implementation='sdpa')
outputs=[]
for item in request:
    wavs,sr=model.generate_custom_voice(text=item['text'],language='Chinese',speaker=item.get('speaker','Uncle_Fu'),do_sample=False,max_new_tokens=2048)
    target=ROOT/'test-artifacts'/'local-dialogue'/item['filename']
    target.parent.mkdir(parents=True,exist_ok=True)
    sf.write(str(target),wavs[0],sr)
    outputs.append({'file':str(target),'text':item['text'],'speaker':item.get('speaker','Uncle_Fu'),'seconds':len(wavs[0])/sr,'sampleRate':sr})
    print(json.dumps(outputs[-1],ensure_ascii=True),flush=True)
(ROOT/'test-artifacts'/'local-dialogue'/'generation.json').write_text(json.dumps(outputs,ensure_ascii=False,indent=2),encoding='utf-8')
