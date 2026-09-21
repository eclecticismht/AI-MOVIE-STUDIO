(function(root){
  const rows=text=>String(text).split('\n').flatMap(line=>Array.from(line).reduce((out,c)=>{if(!out.length||Array.from(out.at(-1)).length>=18)out.push('');out[out.length-1]+=c;return out},[]));
  function validate(cards=[],source){
    if(!Array.isArray(cards)||cards.length>4)throw Error('每镜屏幕信息卡最多 4 项，请拆分镜头');
    let lines=0;
    const result=cards.map(card=>{
      if(!card||typeof card.title!=='string'||typeof card.text!=='string'||!card.text.trim()||card.title.length>40||card.text.length>600||/[{}\\\u0000-\u0008\u000b-\u001f]/.test(card.title+card.text))throw Error('屏幕信息卡内容无效，请使用纯文字');
      if(typeof source!=='string'||!source.trim())throw Error('屏幕信息卡需要对应剧本原文');
      const stateAPI=typeof module!=='undefined'&&module.exports?require('./asset-states'):root.AssetStates;
      stateAPI.validate({screen:{screenText:card.text}},['screen'],source);
      lines+=rows(card.title).length+rows(card.text).length+1;
      if(card.effect!==undefined&&card.effect!=='type-delete')throw Error('屏幕动画无效');
      return {title:card.title.trim(),text:card.text.trim(),...(card.effect?{effect:card.effect}:{})};
    });
    if(lines>13)throw Error('本镜屏幕文字过多，信息卡会遮挡画面，请拆分镜头');
    if(result.some(c=>c.effect)&&result.length!==1)throw Error('动态草稿每镜只能设置一张信息卡');return result;
  }
  function fromShot(shot,library){
    const ids=[...(shot.characterIds||[]),...(shot.sceneIds||[]),...(shot.propIds||[])];
    const cards=Object.entries(shot.assetStates||{}).filter(([id,s])=>ids.includes(id)&&s.screenText?.trim()).map(([id,s])=>{
      const asset=['characters','scenes','props'].flatMap(kind=>library[kind]||[]).find(a=>a.id===id&&a.projectId===shot.projectId);
      if(!asset)throw Error('屏幕信息卡引用资产不存在');return {title:s.screenEffect==='type-delete'?'输入草稿（未发送）':asset.name,text:s.screenText,...(s.screenEffect==='type-delete'?{effect:s.screenEffect}:{})};
    });return validate(cards,shot.sourceExcerpt);
  }
  function timeline(cards,duration){
    if(!cards.some(c=>c.effect))return [{start:0,end:duration,cards}];
    const card=cards[0],phrases=card.text.split('\n').filter(Boolean),weights=phrases.map(t=>Math.max(6,Array.from(t).length)),total=weights.reduce((a,b)=>a+b,0),out=[];let elapsed=0;
    phrases.forEach((text,i)=>{const chars=Array.from(text),base=elapsed,slot=i===phrases.length-1?duration-elapsed:duration*weights[i]/total,n=chars.length;elapsed+=slot;
      for(let k=1;k<=n;k++)out.push({start:base+(k-1)*slot*.4/n,end:base+k*slot*.4/n,cards:[{title:card.title,text:chars.slice(0,k).join('')}]});
      out.push({start:base+slot*.4,end:base+slot*.65,cards:[{title:card.title,text}]});
      for(let k=n-1;k>=0;k--)out.push({start:base+slot*.65+(n-1-k)*slot*.25/n,end:base+slot*.65+(n-k)*slot*.25/n,cards:[{title:card.title,text:chars.slice(0,k).join('')}]});
      out.push({start:base+slot*.9,end:base+slot,cards:[{title:card.title,text:''}]});
    });return out;
  }
  const api={validate,fromShot,rows,timeline};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ScreenCards=api;
})(typeof globalThis!=='undefined'?globalThis:this);
