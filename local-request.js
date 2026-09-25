function requestError(req, {port, origins = []} = {}) {
  const headers = req.headers || {};
  if (headers.host) {
    let host;
    try { host = new URL('http://' + headers.host); } catch { return '本地服务地址无效'; }
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname) || (port && host.port !== String(port))) return '只接受本机工作室地址';
  }
  if (headers.origin) {
    const own = headers.host && 'http://' + headers.host;
    if (headers.origin !== own && !origins.includes(headers.origin)) return '请从本地工作室操作';
  }
  if (headers['sec-fetch-site'] === 'cross-site' && !origins.includes(headers.origin)) return '已拒绝外部页面请求';
  return null;
}
module.exports = {requestError};
