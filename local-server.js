// AI MOVIE STUDIO local static server. Requires only Node.js (no packages).
const http = require("http");
const fs = require("fs");
const path = require("path");
const screenplayApi = require("./screenplay-api").createScreenplayApi();
const filmApi = require('./film-api').createFilmApi();
const firstFrameApi = require('./first-frame-api').createFirstFrameApi();
const aiSettingsApi=require('./ai-settings-api').createSettingsApi();
const actFilmApi=require('./act-film-api').createActFilmApi({canRun:()=>!lifecycle.draining()});
const workspaceApi=require('./workspace-api').createWorkspaceApi();

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const types = {".gif":"image/gif", ".mp4":"video/mp4", ".webm":"video/webm", ".mov":"video/quicktime", ".wav":"audio/wav", ".png":"image/png", ".jpg":"image/jpeg", ".webp":"image/webp", ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8"};

const lifecycle=require('./service-lifecycle').createLifecycle({role:'web',busy:()=>[
 ...(require('./film-api').isBusy()?['成片生成或审片仍在进行']:[]),
 ...(firstFrameApi.isBusy()?['首帧生成仍在进行']:[]),
 ...(actFilmApi.isBusy()?['场次合成仍在进行']:[]),
 ...(require('./timeline-export-api').isBusy()?['剪辑导出仍在进行']:[]),
 ...(require('./sound-design-api').isBusy()?['声音分轨导出仍在进行']:[])
]});
const controlApi=require('./studio-control').createControlApi(lifecycle);
const server=http.createServer(lifecycle.wrap(async (request, response) => {
  const denied=require('./local-request').requestError(request,{port});
  if(denied){response.writeHead(403,{'Content-Type':'application/json; charset=utf-8'});response.end(JSON.stringify({error:denied}));return;}
  const requestPath = new URL(request.url, `http://${request.headers.host}`).pathname;
  if(await controlApi(request,response,requestPath))return;
  if(await workspaceApi(request,response,requestPath))return;
  if(await require('./sound-design-api').api(request,response,requestPath))return;
  if(await require('./studio-status-api').studioStatusApi(request,response,requestPath))return;
  if(await actFilmApi(request,response,requestPath))return;
  if(await aiSettingsApi(request,response,requestPath))return;
  if(await require('./prompt-video').promptVideoApi(request,response,requestPath))return;
  if(await require('./story-document-api').storyDocumentApi(request,response,requestPath))return;
  if(await require('./timeline-export-api').timelineExportApi(request,response,requestPath))return;
  if(await require('./generated-asset-archive').api(root,request,response,requestPath))return;
  if(await require('./asset-media-api').assetMediaApi(request,response,requestPath))return;
  if(await require('./production-review-api').productionReviewApi(request,response,requestPath))return;
  if(await firstFrameApi(request,response,requestPath))return;
  if(await require('./audio-assets').audioAssetApi(request,response,requestPath))return;
  if(await require('./performance-audio').api(request,response,requestPath))return;
  if (await screenplayApi(request, response, requestPath)) return;
  if (await filmApi(request,response,requestPath))return;
  let file;try{file=require('./static-path').resolveStatic(root,requestPath)}catch{response.writeHead(403);response.end('Forbidden');return}
  try { require('./media-response').sendFile(request,response,file,types[path.extname(file)] || 'application/octet-stream'); }
  catch(error) { if(!response.headersSent){response.writeHead(error.code==='ENOENT'?404:500);response.end('Not found')}else response.destroy(); }
},{port})).listen(port, "127.0.0.1", () => console.log(`AI MOVIE STUDIO: http://127.0.0.1:${port}`));

lifecycle.attach(server);
