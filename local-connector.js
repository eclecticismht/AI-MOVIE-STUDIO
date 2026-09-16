// AI MOVIE STUDIO Local Connector. Runs only on 127.0.0.1:8080.
// It accepts H3 jobs from the web cockpit and keeps them local until a real H3 worker is configured.
const http = require("http");
const fs = require("fs");
const path = require("path");
const jobs = new Map();
const port = Number(process.env.CONNECTOR_PORT || 8080);
const queueFile = path.join(__dirname, "connector-queue.json");

try { JSON.parse(fs.readFileSync(queueFile, "utf8")).forEach(job => jobs.set(job.id, job)); } catch (error) { if (error.code !== "ENOENT") console.warn("Could not restore connector queue:", error.message); }
function persistQueue() { fs.writeFileSync(queueFile, JSON.stringify([...jobs.values()], null, 2)); }

function send(response, status, data) {
  response.writeHead(status, {"Content-Type":"application/json; charset=utf-8", "Access-Control-Allow-Origin":"http://127.0.0.1:4173", "Access-Control-Allow-Methods":"GET,POST,OPTIONS"});
  response.end(JSON.stringify(data));
}
function body(request) { return new Promise((resolve, reject) => { let raw=""; request.on("data", chunk => raw += chunk); request.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch (error) { reject(error); } }); }); }

http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") return send(response, 204, {});
  if (request.method === "GET" && request.url === "/health") return send(response, 200, {ok:true, connector:"AI MOVIE STUDIO Local Connector", node:{name:"NODE_01",gpu:"RTX Pro 4000 24GB"}, h3WorkerConfigured:false, queued:jobs.size});
  if (request.method === "GET" && request.url === "/jobs") return send(response, 200, {jobs:[...jobs.values()]});
  if (request.method === "POST" && request.url === "/jobs") {
    try { const job = await body(request); if (!job.id || !job.prompt) return send(response, 400, {ok:false,error:"Job id and H3 prompt are required."}); const prior=jobs.get(job.id),accepted={...prior,...job,connectorStatus:"已接收，等待 H3 Worker",receivedAt:prior?.receivedAt||new Date().toISOString(),retries:prior?.retries||0}; jobs.set(job.id, accepted); persistQueue(); return send(response, 202, {ok:true,job:accepted}); }
    catch { return send(response, 400, {ok:false,error:"Invalid JSON job payload."}); }
  }
  send(response, 404, {ok:false,error:"Unknown connector route."});
}).listen(port, "127.0.0.1", () => console.log(`Local Connector: http://127.0.0.1:${port}`));
