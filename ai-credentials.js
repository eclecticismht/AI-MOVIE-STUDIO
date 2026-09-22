const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
function protect(value,decrypt=false){return new Promise((resolve,reject)=>{
 if(process.platform!=='win32')return reject(Error('本地加密保存目前需要 Windows')); 
 const code=`$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $r=[Security.Cryptography.ProtectedData]::${decrypt?'Unprotect':'Protect'}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))`;
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='';const timer=setTimeout(()=>{child.kill();reject(Error('本地密钥加密超时'))},15000);
 child.stdout.on('data',b=>out+=b);child.stderr.resume();child.on('error',()=>{clearTimeout(timer);reject(Error('无法启动本地密钥保护服务'))});child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(Error('无法读取或保存本地密钥，请重新填写'));try{resolve(decrypt?Buffer.from(out.trim(),'base64').toString('utf8'):out.trim())}catch{reject(Error('本地密钥格式异常'))}});child.stdin.on('error',()=>{});child.stdin.end(decrypt?value:Buffer.from(value,'utf8').toString('base64'));
});}
function createStore({file=path.join(__dirname,'.runtime','ai-credentials.json'),crypt=protect}={}){
 const valid=p=>{if(!['openai','deepseek'].includes(p))throw Error('AI 服务类型无效')};
 function read(){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch(e){if(e.code==='ENOENT')return {};throw Error('本地密钥文件无法读取')}}
 let pending=Promise.resolve();
 return {status(){const data=read();return {openai:!!data.openai,deepseek:!!data.deepseek}},async get(provider){valid(provider);const value=read()[provider];return value?crypt(value,true):''},set(provider,key){valid(provider);if(typeof key!=='string'||key.length>1024||key&&(!/^[\x21-\x7e]+$/.test(key)||key.length<8))throw Error('Key 格式不正确，请粘贴完整密钥，不要包含空格或 Bearer 前缀');const operation=pending.catch(()=>{}).then(async()=>{const value=key?await crypt(key):null,data=read();if(value)data[provider]=value;else delete data[provider];fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(data));fs.renameSync(file+'.tmp',file)});pending=operation;return operation;}};
}
module.exports={createStore,protect,store:createStore()};
