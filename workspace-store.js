(function(root){
 function create(native,{onFailure=()=>{},onSave=()=>{}}={}){
  const initial=native.getItem('aimovie_data');let known=initial,locked=false;
  return {
   getItem:key=>native.getItem(key),
   removeItem:key=>native.removeItem(key),
   setItem(key,value){
    if(key!=='aimovie_data')return native.setItem(key,value);
    try{
     if(locked)throw Error('项目正在恢复，请等待恢复完成后再编辑。');
     if(native.getItem(key)!==known)throw Error('其他页面已修改项目，本次未覆盖。请先下载本页备份，再载入已保存版本。');
     JSON.parse(value);native.setItem(key,value);known=value;onSave(value);
    }catch(error){onFailure(error,known);throw error}
   },
   accept(value,expected){if(expected!==undefined&&native.getItem('aimovie_data')!==expected)throw Error('其他页面已修改项目，浏览器副本未覆盖。');native.setItem('aimovie_data',value);known=value;},
   suspendWrites(){if(locked)throw Error('项目正在恢复');locked=true;return ()=>{locked=false};},
   current:()=>known,
   initial:()=>initial
  };
 }
 const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WorkspaceStore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
