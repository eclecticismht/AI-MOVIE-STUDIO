const Dialogue=require('./dialogue-contract');
const Assets=require('./asset-states');
const {isStructured}=require('./shot-prompt');
const system=`你是影视镜头修改助手。用户用简单自然语言提出修改要求，你负责直接改成可制作的镜头。用户的新要求优先于旧画面、旧对白、旧声音和旧时长；可以删除或改写对白、旁白、字幕、屏幕文字、动作、位置、服装、构图、运镜和环境音。未要求修改的部分保持。不要机械保留与新要求冲突的旧指令，也不要让用户自己写提示词。
只返回 JSON：{script,visual,camera,scene,dialogue,dur,prompt,audioMode,assetStates,breakContinuity,summary}。script是人物行动，visual是画面设计；均为字符串。dialogue每行用角色库中的名字加冒号，旁白可用“旁白：”；没有口头对白则空字符串。屏幕文字用“屏幕文字：”，不能转成说话。单镜4至15秒，按新内容合理安排，一个镜头一个说话人；不能容纳时明确返回error说明需拆镜，不要偷偷省略用户要求。
audioMode通常为model；用户明确要求完全静音时用mute并清空dialogue；未修改声音且原模式为replacement/overlay/voiceover时可以保留该模式；voiceover为独立画外声音轨，改写对白时须切回model并提示重新录制画外声。assetStates返回本镜选中资产的状态对象，用已有id作键，值可含description、screenText、presence；删除屏幕文字时同步清除对应screenText，不生成图片URL。只对本镜改变服装或物品状态时在description明确覆盖原状态。breakContinuity为布尔值，要求与上一镜尾帧不兼容时为true。
prompt按H3格式用英文写三段且顺序固定：integrated_multimodal_description: [Shot 1] ...、overall_soundscape: ...、non_diegetic_music: ...。包含构图、主体、环境、动作、运镜及与dur一致的时间发展；不要添加未提供的图片标签。对白及可见文字保留用户原语言，口头台词只放dialogue，不在prompt嵌入<d>标签。背景音乐无则N/A。左右按观众视角。summary用中文简述实际修改。JSON只包含这些字段，不返回项目id或其他数据。`;
function input(value){
 if(!value?.shot||typeof value.instruction!=='string'||!value.instruction.trim()||value.instruction.length>10000)throw Error('请输入修改要求（最多 10000 字）');
 if(!Array.isArray(value.characters)||value.characters.length>1000)throw Error('角色清单无效');
 return {shot:value.shot,instruction:value.instruction.trim(),characters:value.characters.map(c=>({id:c.id,name:c.name}))};
}
function parse(content,request){
 let r;try{r=JSON.parse(content)}catch{throw Error('AI 修改结果不完整，请重试')}
 if(r?.error)throw Error(String(r.error).slice(0,2000));
 for(const field of ['script','visual','camera','scene','dialogue','prompt','summary'])if(typeof r?.[field]!=='string'||r[field].length>(field==='prompt'?30000:10000))throw Error('AI 修改结果缺少 '+field+'，请重试');
 if(!Number.isFinite(r.dur)||r.dur<4||r.dur>15)throw Error('AI 返回的镜头时长超出 4–15 秒');
 if(!isStructured(r.prompt)||/<d\b/i.test(r.prompt))throw Error('AI 返回的 H3 提示词格式不完整');
 const events=Dialogue.parseDialogue(r.dialogue,request.characters);
 Dialogue.bindDialogue(r.prompt,events,r.dur);
 const audioMode=require('./shot-audio').validate(r.audioMode,events,request.shot.audioAsset);
 const ids=['characterIds','sceneIds','propIds'].flatMap(k=>request.shot[k]||[]);
 const states=Assets.validate(r.assetStates||{},ids);
 for(const state of Object.values(states))delete state.imageUrl;
 for(const [id,state] of Object.entries(request.shot.assetStates||{}))if(ids.includes(id)&&state.imageUrl)states[id]={...states[id],imageUrl:state.imageUrl};
 return {...Object.fromEntries(['script','visual','camera','scene','dialogue','dur','prompt','summary'].map(k=>[k,r[k]])),audioMode,assetStates:states,breakContinuity:r.breakContinuity===true};
}
module.exports={system,input,parse};
