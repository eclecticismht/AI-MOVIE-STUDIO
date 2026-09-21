import os
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
os.environ['HF_HUB_DISABLE_XET']='1'
sys.path.insert(0,str(ROOT/'.runtime'/'asr'))
from huggingface_hub import snapshot_download
snapshot_download('Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice',local_dir=str(ROOT/'.runtime'/'models'/'qwen3-tts-customvoice'),max_workers=3,allow_patterns=['*.json','*.txt','*.safetensors','*.model'])
print('Local voice model downloaded.',flush=True)
