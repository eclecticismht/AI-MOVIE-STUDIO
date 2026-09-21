// Surface real interface failures instead of leaving a button apparently inert.
window.addEventListener('error',event=>{
 if(!event.message)return;
 let banner=document.getElementById('studio-ui-error');
 if(!banner){banner=document.createElement('div');banner.id='studio-ui-error';banner.setAttribute('role','alert');banner.style.cssText='position:fixed;bottom:12px;left:240px;right:20px;padding:14px;background:#442d2d;color:#fff;z-index:99999;white-space:pre-wrap';document.body.append(banner)}
 banner.textContent='界面操作未完成：'+event.message;
});
