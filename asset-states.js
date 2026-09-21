(function(root){
  function validate(states={},ids=[],source){
    if(!states||typeof states!=='object'||Array.isArray(states)||Object.keys(states).length>30)throw Error('镜头资产状态格式无效');
    const result={};
    for(const [id,value] of Object.entries(states)){
      if(!ids.includes(id)||!value||typeof value!=='object')throw Error('资产状态引用了未选中的资产');
      const state={};for(const key of ['description','imageUrl','screenText']){
        if(value[key]!==undefined&&typeof value[key]!=='string')throw Error('资产状态字段必须是文字');
        state[key]=(value[key]||'').trim();if(state[key].length>(key==='screenText'?600:2000))throw Error('资产状态内容过长');
      }
      if(value.presence!==undefined&&!['','onscreen','screen','offscreen'].includes(value.presence))throw Error('人物出现方式无效');
      if(value.presence)state.presence=value.presence;
      if(state.imageUrl&&!/^(?:\/assets\/[^?#]+\.(?:png|jpg|webp)|https?:\/\/[^\s]+)$/i.test(state.imageUrl))throw Error('状态图片请填写本地资产地址或 http(s) 图片地址');
      if(value.screenEffect!==undefined&&!['','static','type-delete'].includes(value.screenEffect))throw Error('屏幕显示方式无效');
      if(value.screenEffect==='type-delete'){if(!state.screenText)throw Error('打字删除效果需要屏幕原文');state.screenEffect='type-delete'}
      if(state.screenText&&source!==undefined){const original=String(source).replace(/\s/g,'');if(state.screenText.split('\n').filter(Boolean).some(line=>{
        const value=line.replace(/\s/g,''),escaped=value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        // 603.72 is not a valid match for the source amount 1603.72.
        return !new RegExp((/^\d/.test(value)?'(?<![\\d.])':'')+escaped+(/\d$/.test(value)?'(?![\\d.])':'')).test(original);
      }))throw Error('屏幕文字不在本镜头剧本原文中，请逐字核对；资产 '+id+'，填写值：'+state.screenText+'；本镜当前引用：'+source+'。若该文字确在剧本，请扩充本镜sourceExcerpt为包含该文字的连续原文，不要改写文字或编造原文。');}
      if(Object.values(state).some(Boolean))result[id]=state;
    }
    return result;
  }
  function resolve(asset,state){
    if(!state)return asset;
    return {...asset,imageUrl:state.imageUrl||asset.imageUrl,notes:[asset.notes,state.description&&'State for this shot only: '+state.description,state.screenText&&(state.screenEffect==='type-delete'?'Unsent draft: typing and deletion are composited later. Keep the screen without legible words; never show sent messages or a successful transfer.':'Exact silent screen text for this shot: '+state.screenText)].filter(Boolean).join('\n'),screenText:state.screenText||'',screenEffect:state.screenEffect};
  }
  const api={validate,resolve};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AssetStates=api;
})(typeof globalThis!=='undefined'?globalThis:this);
