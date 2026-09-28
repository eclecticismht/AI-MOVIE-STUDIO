(function(root){
 const codec=typeof module!=='undefined'&&module.exports?require('./vendor/lz-string/lz-string'):root.LZString;
 const prefix='AMS_LZ16_V1:';
 function decode(raw){
  if(!raw?.startsWith(prefix))return raw;
  const split=raw.indexOf(':',prefix.length),length=Number(raw.slice(prefix.length,split));
  const value=codec.decompressFromUTF16(raw.slice(split+1));
  if(!value||value.length!==length)throw Error('浏览器压缩备份损坏；原数据保留，请从磁盘备份恢复。');
  JSON.parse(value);return value;
 }
 function encode(value){if(value.length<128000)return value;const compressed=prefix+value.length+':'+codec.compressToUTF16(value);return compressed.length<value.length?compressed:value}
 function create(native,{onFailure=()=>{},onSave=()=>{}}={}){
  let stored=native.getItem('aimovie_data');const initial=decode(stored);let known=initial,locked=false;
  return {
   getItem:key=>key==='aimovie_data'?decode(native.getItem(key)):native.getItem(key),
   removeItem:key=>native.removeItem(key),
   setItem(key,value){
    if(key!=='aimovie_data')return native.setItem(key,value);
    try{
     if(locked)throw Error('项目正在恢复，请等待恢复完成后再编辑。');
     if(native.getItem(key)!==stored)throw Error('其他页面已修改项目，本次未覆盖。请先下载本页备份，再载入已保存版本。');
     JSON.parse(value);const next=encode(value);native.setItem(key,next);stored=next;known=value;onSave(value);
    }catch(error){onFailure(error,known);throw error}
   },
   accept(value,expected){if(expected!==undefined&&decode(native.getItem('aimovie_data'))!==expected)throw Error('其他页面已修改项目，浏览器副本未覆盖。');JSON.parse(value);const next=encode(value);native.setItem('aimovie_data',next);stored=next;known=value;},
   suspendWrites(){if(locked)throw Error('项目正在恢复');locked=true;return ()=>{locked=false};},
   current:()=>known,
   initial:()=>initial
  };
 }
 const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WorkspaceStore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
