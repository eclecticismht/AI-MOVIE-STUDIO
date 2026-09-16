// AI MOVIE STUDIO local static server. Requires only Node.js (no packages).
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const types = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8"};

http.createServer((request, response) => {
  const requestPath = new URL(request.url, `http://${request.headers.host}`).pathname;
  const relative = requestPath === "/" ? "AI_MOVIE_STUDIO.html" : decodeURIComponent(requestPath).replace(/^\/+/, "");
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) && file !== root) { response.writeHead(403); return response.end("Forbidden"); }
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(error.code === "ENOENT" ? 404 : 500); return response.end("Not found"); }
    response.writeHead(200, {"Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control":"no-store"});
    response.end(data);
  });
}).listen(port, "127.0.0.1", () => console.log(`AI MOVIE STUDIO: http://127.0.0.1:${port}`));
