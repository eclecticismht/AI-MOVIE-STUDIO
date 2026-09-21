(function(root){
  function groups(shots,source=''){
    const clean=s=>String(s||'').replace(/\s+/g,'');
    const headings=[...source.matchAll(/^\s*(?:第[0-9一二三四五六七八九十百]+场|场景[0-9一二三四五六七八九十百]+)[^\n]*/gm)].map(m=>({title:m[0].trim(),at:clean(source.slice(0,m.index)).length}));
    const text=clean(source),out=[];
    for(const shot of shots){const excerpt=clean(shot.sourceExcerpt),at=excerpt?text.indexOf(excerpt):-1,heading=at<0?null:headings.filter(h=>h.at<=at).at(-1);
      const title=heading?.title||shot.scene||'未命名场景',key=heading?'source:'+heading.at:title;
      if(!out.length||out.at(-1).key!==key)out.push({key,title,index:out.length+1,shots:[]});out.at(-1).shots.push(shot);
    }return out;
  }
  function pending(shots){return shots.filter(s=>!['black','screen'].includes(s.renderMode)&&!String(s.prompt||'').trim())}
  const api={groups,pending};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StoryFlowModel=api;
})(typeof globalThis!=='undefined'?globalThis:this);
