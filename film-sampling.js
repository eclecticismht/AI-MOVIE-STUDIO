(function(root){
  function select(shots,ids){
    if(!Array.isArray(ids)||!ids.length||ids.length>12)throw Error('请从当前批次选择 1–12 个镜头制作样片');
    const wanted=new Set(ids);if(wanted.size!==ids.length||ids.some(id=>!shots.some(s=>s.id===id)))throw Error('样片选择已失效，请在当前批次重新选择');
    return shots.filter(s=>wanted.has(s.id));
  }
  const api={select};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FilmSampling=api;
})(typeof globalThis!=='undefined'?globalThis:this);
