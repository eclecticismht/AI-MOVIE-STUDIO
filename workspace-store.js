(function(root){
 function create(native,{onFailure=()=>{},onSave=()=>{}}={}){
  let known=native.getItem('aimovie_data');
  return {
   getItem:key=>native.getItem(key),
   removeItem:key=>native.removeItem(key),
   setItem(key,value){
    if(key!=='aimovie_data')return native.setItem(key,value);
    try{
     if(native.getItem(key)!==known)throw Error('其他页面已修改项目，本次未覆盖。请先下载本页备份，再载入已保存版本。');
     JSON.parse(value);native.setItem(key,value);known=value;onSave(value);
    }catch(error){onFailure(error,known);throw error}
   },
   accept(value){native.setItem('aimovie_data',value);known=value;},
   current:()=>known
  };
 }
 const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WorkspaceStore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
