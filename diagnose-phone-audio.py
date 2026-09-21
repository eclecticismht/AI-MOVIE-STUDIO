import os,sys,json
root=os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0,os.path.join(root,'.runtime','asr'))
from faster_whisper import WhisperModel
from opencc import OpenCC
model=WhisperModel(os.path.join(root,'.runtime','models','whisper-medium'),device='cpu',compute_type='int8',local_files_only=True,cpu_threads=4)
segments,info=model.transcribe(sys.argv[1],language='zh',beam_size=5,vad_filter=False,condition_on_previous_text=False)
converter=OpenCC('t2s')
result={'model':'medium-no-vad','segments':[{'start':s.start,'end':s.end,'text':s.text,'normalizedText':converter.convert(s.text),'noSpeechProbability':s.no_speech_prob} for s in segments]}
with open(sys.argv[2],'w',encoding='utf8') as f:json.dump(result,f,ensure_ascii=False,indent=2)
sys.stdout.buffer.write(json.dumps(result,ensure_ascii=False).encode('utf8'))
