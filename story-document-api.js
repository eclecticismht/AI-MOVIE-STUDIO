const path=require('path'),fs=require('fs'),os=require('os'),{spawn}=require('child_process');
const formats=new Set(['txt','md','docx','pdf','odt','html','htm']);
function pythonPath(){return process.env.STORY_PYTHON||path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','python','python.exe')}
function extractDocument(data,ext){return new Promise((resolve,reject)=>{
  if(!formats.has(ext))return reject(Error('支持 TXT、MD、DOCX、PDF、ODT、HTML；旧版 DOC 请另存为 DOCX。'));
  if(!data.length||data.length>10*1024*1024)return reject(Error('文件不能为空且不能超过 10 MB。'));
  const python=pythonPath();if(!fs.existsSync(python))return reject(Error('文档读取组件未配置，请设置 STORY_PYTHON 指向安装了 pypdf 的 Python。'));
  const child=spawn(python,[path.join(__dirname,'story-document.py'),ext],{windowsHide:true,stdio:['pipe','pipe','pipe']}),chunks=[];let size=0;
  const timer=setTimeout(()=>{child.kill();reject(Error('文档读取超时，请拆分文件后重试。'))},45000);
  child.on('error',e=>{clearTimeout(timer);reject(e)});child.stderr.resume();child.stdin.on('error',()=>{});
  child.stdout.on('data',b=>{size+=b.length;if(size>1000000){child.kill();reject(Error('文档内容过大。'))}else chunks.push(b)});
  child.on('close',()=>{clearTimeout(timer);try{const out=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(out.error)throw Error(out.error);if(typeof out.text!=='string'||!out.text.trim())throw Error('未读取到故事文字。');resolve(out.text)}catch(e){reject(e)}});child.stdin.end(data);
})}
async function storyDocumentApi(req,res,url){if(url!=='/api/story-document')return false;
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
  if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){send(403,{error:'请从本地工作室上传。'});return true}
  if(req.method!=='POST'){send(405,{error:'请上传故事文件。'});return true}
  try{const ext=new URL(req.url,'http://localhost').searchParams.get('ext')?.toLowerCase();if(!formats.has(ext))throw Error('不支持此格式，请使用 DOCX、PDF、TXT、MD、ODT 或 HTML。');const chunks=[];let size=0;for await(const b of req){size+=b.length;if(size>10485760)throw Error('文件不能超过 10 MB。');chunks.push(b)}const text=await extractDocument(Buffer.concat(chunks),ext);send(200,{text,characters:text.length})}catch(e){send(400,{error:e.message})}return true;
}
module.exports={extractDocument,storyDocumentApi};
