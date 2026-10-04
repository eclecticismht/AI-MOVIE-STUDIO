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
 let worker=null,serial=0;const requests=new Map();
 function encodeInWorker(value){
  if(value.length<128000)return Promise.resolve(value);
  if(typeof root.Worker!=='function')return Promise.reject(Error('浏览器不支持后台保存，请复制草稿后使用新版 Chrome 或 Edge。'));
  if(!worker){
   worker=new root.Worker('workspace-codec-worker.js?v=20261004-input2');
   worker.onmessage=({data})=>{const request=requests.get(data.id);if(!request)return;requests.delete(data.id);clearTimeout(request.timer);data.error?request.reject(Error(data.error)):request.resolve(data.encoded)};
   worker.onerror=()=>{worker.terminate();worker=null;for(const request of requests.values()){clearTimeout(request.timer);request.reject(Error('后台保存组件加载失败，输入草稿已保留，请刷新重试。'))}requests.clear()};
  }
  return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{requests.delete(id);reject(Error('后台保存超时，草稿仍保留。'))},30000);requests.set(id,{resolve,reject,timer});worker.postMessage({id,value})});
 }
 function create(native,{onFailure=()=>{},onSave=()=>{},encodeAsync=encodeInWorker}={}){
  let stored=native.getItem('aimovie_data');const initial=decode(stored);let known=initial,locked=false;
  // Cache only an exact raw-value match: another tab must still be observed.
  let readRaw=stored,readValue=initial;
  function getItem(key){if(key!=='aimovie_data')return native.getItem(key);const raw=native.getItem(key);if(raw===readRaw)return readValue;const value=decode(raw);readRaw=raw;readValue=value;return value}
  function publish(value,next){native.setItem('aimovie_data',next);stored=next;known=value;readRaw=next;readValue=value;onSave(value)}
  function assertWritable(){
   if(locked)throw Error('项目正在恢复，请等待恢复完成后再编辑。');
   if(native.getItem('aimovie_data')!==stored)throw Object.assign(Error('其他页面已修改项目，本次未覆盖。请先下载本页备份，再载入已保存版本。'),{code:'WORKSPACE_EXTERNAL_CHANGE'});
  }
  return {
   getItem,
   removeItem:key=>native.removeItem(key),
   setItem(key,value){
    if(key!=='aimovie_data')return native.setItem(key,value);
    try{assertWritable();JSON.parse(value);publish(value,encode(value));}
    catch(error){onFailure(error,known);throw error}
   },
   async setItemAsync(key,value){
    if(key!=='aimovie_data')return native.setItem(key,value);
    assertWritable();JSON.parse(value);const expected=stored;
    const next=await encodeAsync(value);
    assertWritable();
    if(stored!==expected)throw Object.assign(Error('保存期间工作区已更新，需要按最新版本重新合并。'),{code:'WORKSPACE_LOCAL_CHANGE'});
    if(typeof next!=='string')throw Error('后台保存返回了无效结果，草稿仍保留。');
    // Async callers have not changed D. A failure must not roll back newer edits.
    publish(value,next);
   },
   accept(value,expected){if(expected!==undefined&&getItem('aimovie_data')!==expected)throw Error('其他页面已修改项目，浏览器副本未覆盖。');JSON.parse(value);const next=encode(value);native.setItem('aimovie_data',next);stored=next;known=value;readRaw=next;readValue=value;},
   suspendWrites(){if(locked)throw Error('项目正在恢复');locked=true;return ()=>{locked=false};},
   current:()=>known,
   initial:()=>initial
  };
 }
 const api={create,encode,decode};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WorkspaceStore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
