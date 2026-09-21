from pathlib import Path
import sys
root=Path(__file__).resolve().parent
sys.path.insert(0,str(root/'.runtime/asr'))
from huggingface_hub import snapshot_download
snapshot_download('Systran/faster-whisper-large-v3',local_dir=str(root/'.runtime/models/whisper-large-v3'),allow_patterns=['*.json','model.bin','vocabulary.*'],max_workers=4)
print('large-v3 downloaded')
