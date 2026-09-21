// AI MOVIE STUDIO local static server. Requires only Node.js (no packages).
const http = require("http");
const fs = require("fs");
const path = require("path");
const screenplayApi = require("./screenplay-api").createScreenplayApi();
const filmApi = require('./film-api').createFilmApi();
const firstFrameApi = require('./first-frame-api').createFirstFrameApi();

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const types = {".gif":"image/gif", ".mp4":"video/mp4", ".webm":"video/webm", ".mov":"video/quicktime", ".wav":"audio/wav", ".png":"image/png", ".jpg":"image/jpeg", ".webp":"image/webp", ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8"};

http.createServer(async (request, response) => {
  const requestPath = new URL(request.url, `http://${request.headers.host}`).pathname;
  if(await require('./story-document-api').storyDocumentApi(request,response,requestPath))return;
  if(await require('./timeline-export-api').timelineExportApi(request,response,requestPath))return;
  if(await require('./asset-media-api').assetMediaApi(request,response,requestPath))return;
  if(await require('./production-review-api').productionReviewApi(request,response,requestPath))return;
  if(await firstFrameApi(request,response,requestPath))return;
  if(await require('./audio-assets').audioAssetApi(request,response,requestPath))return;
  if (await screenplayApi(request, response, requestPath)) return;
  if (await filmApi(request,response,requestPath))return;
  let file;try{file=require('./static-path').resolveStatic(root,requestPath)}catch{response.writeHead(403);response.end('Forbidden');return}
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(error.code === "ENOENT" ? 404 : 500); return response.end("Not found"); }
    response.writeHead(200, {"Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control":"no-store"});
    response.end(data);
  });
}).listen(port, "127.0.0.1", () => console.log(`AI MOVIE STUDIO: http://127.0.0.1:${port}`));
