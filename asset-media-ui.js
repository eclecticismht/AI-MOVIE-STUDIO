function assetMediaType(file){
 const extensions={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime'};
 const extension=String(file.name||'').split('.').pop().toLowerCase();
 const type=extensions[extension]||file.type;
 if(!Object.values(extensions).includes(type))throw Error('支持 JPG/JPEG、PNG、WebP、GIF 图片和 MP4、WebM、MOV 视频');
 return type;
}
async function importAssetMedia(collection,id,kind,input){
 const file=input.files?.[0];if(!file)return;
 try{
  if(file.size>5*1024*1024)throw Error('单个资产文件不能超过 5 MB');
  const type=assetMediaType(file);
  if(!type.startsWith(kind+'/'))throw Error('请选择对应类型的资产文件');
  input.disabled=true;
  const response=await fetch('/api/asset-media',{method:'POST',headers:{'Content-Type':type},body:file});
  const out=await response.json();if(!response.ok)throw Error(out.error||'上传失败');
  const asset=D[collection].find(x=>x.id===id);if(!asset)return;
  const updated=D[collection].map(x=>{
   if(x!==asset)return x;
   const next={...x,[kind+'Url']:out.url};
   if(kind==='video'&&out.posterUrl&&(!x.imageUrl||x.imageUrl===x.videoPosterUrl)){next.imageUrl=out.posterUrl;next.videoPosterUrl=out.posterUrl;}
   if(kind==='image')delete next.videoPosterUrl;
   return next;
  });
  localStorage.setItem('aimovie_data',JSON.stringify({...D,[collection]:updated}));
  D[collection]=updated;renderModules();
 }catch(error){alert('资产导入失败：'+error.message)}finally{input.disabled=false;input.value='';}
}
