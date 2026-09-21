const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {snapshot,audit}=require('./production-review');
async function productionReviewApi(req,res,pathname){
 if(pathname!=='/api/production-review')return false;
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))};
 try{
  if(req.method!=='POST')throw Error('请从工作室保存检查包');
  if(req.headers.origin&&!['http://127.0.0.1:4173','http://localhost:4173'].includes(req.headers.origin))throw Error('只接受本地工作室请求');
  const raw=await require('./request-body').readUtf8(req,6000000,'检查包过大');
  const input=JSON.parse(raw);if(!Array.isArray(input.shots)||input.shots.length>160)throw Error('镜头数量无效');
  const project=input.project,batch={...input.batch,projectId:project.id},shots=input.shots.map(s=>({...s,projectId:project.id,storyboardBatchId:batch.id})),assets=Object.fromEntries(['characters','scenes','props'].map(kind=>[kind,(input.assets?.[kind]||[]).map(a=>({...a,projectId:project.id}))]));
  const doc=snapshot(project,batch,shots,assets,undefined);doc.createdAt=new Date().toISOString();doc.review=audit(doc);
  const id='review_'+crypto.randomBytes(8).toString('hex'),dir=path.join(__dirname,'production-reviews');fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,id+'.json');fs.writeFileSync(file,JSON.stringify(doc,null,2));send(201,{id,url:'/production-reviews/'+id+'.json'});
 }catch(error){send(400,{error:error.message})}return true;
}
module.exports={productionReviewApi};
