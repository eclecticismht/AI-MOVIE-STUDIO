// Adapt upstream templates to this installation; never overwrite original videos.
const fs=require('node:fs'),path=require('node:path');
const root='.runtime/ComfyUI-H3-FaceRefine/example_workflows';
const info=JSON.parse(fs.readFileSync('test-artifacts/face-refine-object-info.json'));
const run=JSON.parse(fs.readFileSync('film-runs/film_6c37d0e6b017be7e/run.json'));
const shot=run.shots[2];
fs.mkdirSync('workflows',{recursive:true});
for(const kind of ['Auto','Manual']){
 const w=JSON.parse(fs.readFileSync(`${root}/H3_Face_Refine_${kind}_Select.json`));
 const keep=new Set(w.nodes.filter(n=>n.mode!==2).map(n=>n.id));
 w.nodes=w.nodes.filter(n=>keep.has(n.id));w.links=w.links.filter(l=>keep.has(l[1])&&keep.has(l[3]));
 const links=new Set(w.links.map(l=>l[0]));
 for(const n of w.nodes){
  for(const input of n.inputs||[])if(!links.has(input.link))input.link=null;
  for(const out of n.outputs||[])out.links=(out.links||[]).filter(l=>links.has(l));
  const v=n.widgets_values;
  if(n.type==='UNETLoader')v[0]='Minimax_H3\\minimax_h3_fl2va_pruned_int8_convrot.safetensors';
  if(n.type==='VAELoader')v[0]=v[0].split('\\').at(-1);
  if(n.type==='LoraLoaderModelOnly')v[0]='minimax_h3\\minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors';
  if(n.type==='LoadImage')v[0]=shot.firstFrame?.file||shot.references[0].file;
  if(n.type==='MiniMaxH3ReferenceToVideo')v[0]=shot.prompt;
  if(n.type==='VHS_LoadVideoPath'){v.video=path.resolve('film-runs',run.id,'source-2.mp4');delete v.videopreview;}
  if(n.type==='H3FaceSelect')v[0]=path.resolve('film-runs',run.id,'source-2.mp4');
  if(n.type==='H3FaceTrackCrop'){v[0]='bbox\\face_yolov8m.pt';v[3]=512;v[4]=512;v[5]='manual';v[10]=false;}
  if(n.type==='VHS_VideoCombine')v.filename_prefix='AI_MOVIE_STUDIO/FaceRefine/refined';
 }
 fs.writeFileSync(`workflows/H3-FaceRefine-${kind}.json`,JSON.stringify(w,null,2));
 if(kind!=='Auto')continue;
 const graph={};
 for(const n of w.nodes){
  if(n.type==='Note')continue;
  if(!info[n.type])throw Error('Missing node '+n.type);
  const inputs={},widgets=n.widgets_values;let wi=0;
  for(const [name,spec] of Object.entries({...info[n.type].input.required,...info[n.type].input.optional})){
   const scalar=Array.isArray(spec[0])||['INT','FLOAT','STRING','BOOLEAN','COMBO'].includes(spec[0]);
   if(scalar){
    const value=Array.isArray(widgets)?widgets[wi++]:widgets?.[name];
    if(value!==undefined)inputs[name]=value;
    if(spec[1]?.control_after_generate&&Array.isArray(widgets))wi++;
   }
  }
  if(!Array.isArray(widgets))for(const [k,v] of Object.entries(widgets||{}))if(k!=='videopreview')inputs[k]=v;
  for(const input of n.inputs||[]){const l=w.links.find(l=>l[0]===input.link);if(l)inputs[input.name]=[String(l[1]),l[2]];}
  graph[n.id]={class_type:n.type,inputs};
 }
 graph['1'].inputs.frame_load_cap=39;
 graph['23'].inputs.filename_prefix='AI_MOVIE_STUDIO/FaceRefine/installation-test';
 fs.writeFileSync('test-artifacts/face-refine-test-prompt.json',JSON.stringify(graph,null,2));
}
console.log('Prepared local templates and bounded installation test.');
