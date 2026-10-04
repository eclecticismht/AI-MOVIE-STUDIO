(function(root){
  const clean=s=>String(s||'').replace(/\s+/g,'').replace(/[“”「」『』]/g,'');
  const isNarration=name=>/^(?:旁白|画外音|画外音新闻|新闻画外音|新闻播报|广播新闻)$/.test(name);
  function parseDialogue(text,characters=[]){
    if(!String(text||'').trim())return [];
    let input=String(text).trim();
    // Legacy single-line turns are separated only at known character labels.
    input=input.split('\n').map(line=>{
      if(/^屏幕文字[:：]/.test(line.trim()))return line;
      for(const c of characters){const name=c.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');line=line.replace(new RegExp('\\s+(?='+name+'(?:[（(][^）)]*[）)])?[:：])','g'),'\n')}return line;
    }).join('\n');
    return input.split(/\n+/).filter(s=>s.trim()).map(line=>{
      let delivery='onscreen';line=line.trim();
      if(/^画外声音[:：]/.test(line)){delivery='offscreen';line=line.replace(/^画外声音[:：]\s*/,'')}
      const m=/^([^:：]{1,50})[:：]\s*(.+)$/.exec(line);
      if(!m)throw Error('对白须每行写“人物名：原句”；微信文字写“屏幕文字：内容”，不要把动作写进对白。');
      const label=m[1].trim(),text=m[2].trim();
      if(label==='屏幕文字')return {type:'screen',text};
      if(['环境音','音效'].includes(label))return {type:'sound',text};
      if(/[（(](语音|电话)[）)]/.test(label))delivery='phone';
      else if(/[（(](画外|画外音)[）)]/.test(label))delivery='offscreen';
      const name=label.replace(/[（(](语音|电话|画外|画外音)[）)]/g,'').trim();
      const speaker=characters.find(c=>c.name===name);
      if(!speaker&&!isNarration(name))throw Error('对白人物“'+name+'”不在本项目角色库，请选择正确人物。');
      if(/[<>]/.test(text))throw Error('对白只能包含台词正文，不能包含模型标签。');
      return {type:'speech',speakerId:speaker?.id||'narrator',speakerName:name,delivery:isNarration(name)?'offscreen':delivery,text};
    });
  }
  function checkCharacterBindings(shot,characters=[]){
    if(!Array.isArray(shot.characterIds))return;
    const selected=new Set(shot.characterIds),events=parseDialogue(shot.dialogue||'',characters);
    const missing=events.filter(e=>e.type==='speech'&&e.delivery==='onscreen'&&!selected.has(e.speakerId)).map(e=>e.speakerName);
    const names=characters.filter(c=>c.name).slice().sort((a,b)=>b.name.length-a.name.length);
    for(let part of String(shot.characters??shot.char??'').split(/[、，,;；\n]/)){
      for(const c of names){const at=part.indexOf(c.name);if(at<0)continue;const tail=part.slice(at+c.name.length);
        const offscreen=/^(?:[（(][^）)]*(?:画外|声音|仅提及|电话)[^）)]*[）)]|的声音)/.test(tail)||shot.assetStates?.[c.id]?.presence==='offscreen';
        if(!offscreen&&!selected.has(c.id)&&c.type!=='仅提及')missing.push(c.name);
        part=part.slice(0,at)+' '.repeat(c.name.length)+tail;
      }
    }
    if(missing.length)throw Error('画内人物未绑定独立角色资产：'+[...new Set(missing)].join('、')+'。请补齐角色引用，画外人物应明确标为画外。');
  }
  function validateEvents(events){
    if(!Array.isArray(events)||events.length>40)throw Error('对白结构无效。');
    return events.map(e=>{
      if(!e||!['speech','screen','sound'].includes(e.type)||typeof e.text!=='string'||!e.text.trim()||e.text.length>2000||/[<>]/.test(e.text))throw Error('对白内容无效。');
      if(e.type==='speech'&&(typeof e.speakerId!=='string'||!e.speakerId||typeof e.speakerName!=='string'||!e.speakerName||!['onscreen','offscreen','phone'].includes(e.delivery)))throw Error('台词未绑定说话人物或发声位置。');
      return e.type==='speech'?{type:e.type,speakerId:e.speakerId,speakerName:e.speakerName,delivery:e.delivery,text:e.text.trim()}:{type:e.type,text:e.text.trim()};
    });
  }
  // Only explicit speaking labels authorize direct speech independently of an
  // AI fact summary. Longest aliases win; thoughts and written messages never do.
  function sourceSpeaker(label,characters=[]){
    const bare=String(label).replace(/[（(][^）)]*[）)]/g,'').split(/[。！？!?]\s*/).at(-1).trim();
    if(isNarration(bare)||bare==='画外声音')return {id:'narrator',name:bare};
    const names=characters.flatMap(c=>[c.name,...(c.aliases||[])].filter(Boolean).map(name=>({c,name}))).sort((a,b)=>b.name.length-a.name.length);
    for(const {c,name} of names){if(!bare.startsWith(name))continue;const suffix=bare.slice(name.length).trim();
      if(!suffix||/^(?:的声音|喘着气|(?:笑着|低声|轻声|大声|高声|小声|在身后|在门口|仰头|回头|忍不住|故意|轻轻|缓缓)*(?:笑道|说道|说|问道|问|回答|答道|答|喊道|喊|应道|应))$/.test(suffix))return {id:c.id,name:c.name};
    }return null;
  }
  function sourceSpeech(source,characters=[]){
    return String(source||'').split(/\n/).flatMap(line=>{const m=/^\s*([^:：]{1,50})[:：]\s*(.+)$/.exec(line);if(!m)return [];const speaker=sourceSpeaker(m[1],characters);return speaker?[{speakerId:speaker.id,speakerName:speaker.name,text:m[2].trim(),label:m[1].trim()}]:[]});
  }
  function checkSource(events,source,characters=[]){
    if(!source)return;
    for(const e of events)if(e.type==='sound'){
      const spoken=String(source).split(/\n/).some(line=>{
        const m=/^\s*([^:：]{1,50})[:：]\s*(.+)$/.exec(line);
        return m&&(isNarration(m[1].trim())||/[（(](?:画外|画外音|语音|电话)[）)]/.test(m[1]))&&clean(m[2]).includes(clean(e.text));
      });
      if(spoken)throw Error('原文中的画外播报或语音不能归为环境音，请保留说话标签并按对白时长拆镜。');
    }
    for(const e of events)if(e.type==='speech'){
      const written=[...String(source).matchAll(/(?:配文|文字消息|屏幕文字|打字)[:：]\s*[“「"]([^”」"\n]+)[”」"]/gu)].map(m=>clean(m[1]));
      if(written.some(text=>text&&clean(e.text).includes(text)))throw Error('剧本明确标注为书面配文或文字消息，不能作为口头对白。');
      if(!clean(source).includes(clean(e.text)))throw Error('台词“'+e.text+'”不在对应剧本原文中，请核对后修改剧本，不能在分镜阶段擅自改词。');
      // Verify explicit screenplay speaker labels when present; do not infer a
      // speaker from prose narration or a voice heard through another character's phone.
      const lines=String(source).split(/\n/);
      const labelled=lines.filter(line=>clean(line).includes(clean(e.text))&&/^\s*[^:：]{1,50}[:：]/.test(line));
      if(labelled.length){
        const known=characters.length?characters:events.filter(x=>x.type==='speech').map(x=>({id:x.speakerId,name:x.speakerName}));
        const expected=sourceSpeaker(e.speakerName,known)||{id:e.speakerId,name:e.speakerName};
        const who=labelled.map(line=>line.split(/[:：]/)[0].trim());
        const compatible=who.some(label=>{const p=sourceSpeaker(label,known);return p&&(p.id===expected.id||p.name===expected.name||p.name==='画外声音'||(isNarration(p.name)&&isNarration(expected.name)))});
        if(!compatible){if(who.some(label=>/打字|屏幕文字|文字消息/.test(label)))throw Error('剧本中的文字消息被写成口头对白，请改为“屏幕文字：原文”。');
          throw Error('台词说话人物与剧本不符：原文为“'+who[0]+'”，分镜为“'+e.speakerName+'”。');}
      }
    }
  }
  function repairEvents(events,source){
    return validateEvents(events).map(e=>{
      if(e.type!=='speech')return e;
      const line=String(source||'').split(/\n/).find(line=>clean(line).includes(clean(e.text))&&/^\s*[^:：]{0,25}(?:打字|屏幕文字|文字消息)[:：]/.test(line));
      return line?{type:'screen',text:e.text}:e;
    });
  }
  function eventText(e){return e.type==='screen'?'屏幕文字：'+e.text:e.type==='sound'?'环境音：'+e.text:e.speakerName+(e.delivery==='phone'?'（语音）':e.delivery==='offscreen'?'（画外）':'')+'：'+e.text}
  function bindDialogue(prompt,events,duration,references=[],speakerPosition,audioTiming=false){
    events=validateEvents(events);const speech=events.filter(e=>e.type==='speech');
    if(/<d\b/i.test(prompt))throw Error('画面提示词含未校验台词，请重新编写提示词；台词由对白栏统一绑定。');
    // Visual-only rewriting can accidentally veto the separately verified speech.
    // Override global vetoes, keeping scoped instructions such as other people staying silent.
    if(speech.length)prompt=prompt
      .replace(/\bno (?:intelligible speech|intelligible voices|spoken words|vocal content|voices|dialogue)\b/gi,'Only the verified dialogue is audible')
      .replace(/\bthe words are unintelligible\b/gi,'the words match the verified dialogue exactly')
      .replace(/\bcarried only as raw vocal effort\b/gi,'spoken clearly as the verified line');
    // A short shot with several speakers is especially prone to speaker swaps.
    if(new Set(speech.map(e=>e.speakerId)).size>1)throw Error('同一镜头含多个说话人物，请按说话轮次拆镜；每镜可保留其他人物的无声反应。');
    const units=speech.reduce((n,e)=>n+Array.from(e.text.replace(/[\s，。！？、…,.!?]/g,'')).length,0);
    if(!audioTiming&&units/4+0.8>duration)throw Error('台词过长，当前时长难以自然说完；请延长镜头或拆分台词。');
    const extra=speech.length?speech.map(e=>{
      const i=references.findIndex(r=>r.assetId===e.speakerId),subject=speakerPosition&&e.delivery==='onscreen'?`the person on the viewer’s ${speakerPosition} (${e.speakerName})`:i>=0?`<Subject ${i+1}> (${e.speakerName})`:e.speakerName;
      return `${subject} (S1), ${e.delivery==='phone'?'heard ONLY through the phone loudspeaker, physically off-screen':e.delivery==='offscreen'?'off-screen voice only':'the sole visible speaking character'}, says exactly <d>[Chinese]${e.text}</d>. All other visible people keep their mouths closed. Do not change words, add speech, or move this voice to another character.`;
    }).join('\n'):'No spoken words, narration, singing or intelligible voices. Visible people do not speak or perform speech-like lip movements. Allow natural mouth movement required by the scripted actions, including eating, chewing, drinking and breathing.';
    const boundary=prompt.indexOf('overall_soundscape:');
    const instruction='\n\nSpoken performance (authoritative):\n'+extra+'\nOn-screen text messages are silent and must never be spoken. Do not draw dialogue subtitles, captions, speaker labels or karaoke text onto the video; dialogue is audio only. Any explicitly requested device-screen content stays inside that device.\n\n';
    return boundary<0?prompt+instruction:prompt.slice(0,boundary)+instruction+prompt.slice(boundary);
  }
  const api={parseDialogue,validateEvents,checkSource,bindDialogue,repairEvents,eventText,sourceSpeaker,sourceSpeech,checkCharacterBindings};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DialogueContract=api;
})(typeof globalThis!=='undefined'?globalThis:this);
