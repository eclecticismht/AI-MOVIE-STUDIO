// Bounded local experiment: one exact phone line, no video rerender or asset mutation.
const fs=require('node:fs');
async function defaults(type){
 const info=(await (await fetch('http://127.0.0.1:8188/object_info/'+type)).json())[type];
 const inputs={};for(const [name,[kind,options={}]] of Object.entries(info.input.required||{})){
  if(options.default!==undefined)inputs[name]=options.default;
  else if(Array.isArray(kind))inputs[name]=kind[0];
  else if(options.options)inputs[name]=options.options[0];
 }return {class_type:type,inputs};
}
(async()=>{
 const run=JSON.parse(fs.readFileSync('film-runs/film_e7bd45a903055b1b/run.json'));
 const text=run.shots[2].dialogueEvents[0].text;
 const graph={
  1:{class_type:'UNETLoader',inputs:{unet_name:'Minimax_H3\\minimax_h3_fl2va_pruned_int8_convrot.safetensors',weight_dtype:'default'}},
  2:{class_type:'CLIPLoader',inputs:{clip_name:'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',type:'minimax',device:'default'}},
  3:{class_type:'VAELoader',inputs:{vae_name:'minimax_h3_video_vae_fp16.safetensors'}},
  4:{class_type:'VAELoader',inputs:{vae_name:'minimax_h3_audio_vae_fp32.safetensors'}},
  5:await defaults('MiniMaxH3VoiceProfileT8'),6:await defaults('MiniMaxH3SpeechPlanT8'),7:await defaults('MiniMaxH3SpeechStudioT8'),
  8:{class_type:'SaveAudio',inputs:{audio:['7',0],filename_prefix:'AI_MOVIE_STUDIO/speech/phone-exact-test'}}
 };
 Object.assign(graph[5].inputs,{voice_mode:'described_voice',speaker_id:'sun_jiajun',language:'Chinese',voice_description:'Young adult Chinese man, relaxed slightly nasal conversational voice, natural Mandarin, clear words, unhurried but continuous delivery.'});
 Object.assign(graph[6].inputs,{voice_profile:['5',0],text,language:'Chinese',acting_direction:'Speak the exact complete line once, naturally, without introducing or explaining it.',emotion:'casual',space:'close',chunking:'single_segment',target_units:60,max_units:80});
 Object.assign(graph[7].inputs,{model:['1',0],clip:['2',0],video_vae:['3',0],audio_vae:['4',0],voice_profile:['5',0],speech_plan:['6',0],seed:9181701,render_seconds:12.25,resolution:32,steps:20,verify_mode:'off',release_policy:'clear_execution_cache'});
 const response=await fetch('http://127.0.0.1:8188/prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:'ams-phone-speech-test',prompt:graph})});
 const result=await response.json();fs.writeFileSync('test-artifacts/local-phone-speech.json',JSON.stringify({text,graph,result},null,2));
 if(!response.ok||!result.prompt_id)throw Error(JSON.stringify(result));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.message);process.exitCode=1});
