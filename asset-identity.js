(function(root){
 const key=name=>String(name||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
 function visualRequired(asset){return !asset.audioOnly&&asset.type!=='仅提及'&&!/^(画外音|旁白|电视新闻播音员|新闻播报声)$/.test(asset.name||'')}
 function find(assets,project,kind,name){const linked=project.assetAliases?.[kind]?.[key(name)];return assets.find(a=>a.projectId===project.id&&a.id===linked)||assets.find(a=>a.projectId===project.id&&key(a.name)===key(name))}
 function suggestions(assets){const base=a=>key(a.name).replace(/(?:小餐馆|餐馆|店内|室内)$/,'');return assets.flatMap((a,i)=>assets.slice(i+1).filter(b=>a.projectId===b.projectId&&base(a)===base(b)&&base(a).length>1).map(b=>[a,b]))}
 function link(project,assets,kind,id,names){if(!['characters','scenes','props'].includes(kind)||!assets.some(a=>a.id===id&&a.projectId===project.id))throw Error('请选择当前项目资产');const aliases={...project.assetAliases,[kind]:{...project.assetAliases?.[kind]}};for(const name of names){if(!key(name)||name.length>120)throw Error('别名无效');aliases[kind][key(name)]=id}return {...project,assetAliases:aliases}}
 const api={key,visualRequired,find,suggestions,link};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AssetIdentity=api;
})(typeof globalThis!=='undefined'?globalThis:this);
