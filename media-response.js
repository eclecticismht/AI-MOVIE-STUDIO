const fs = require('node:fs');

function byteRange(value, size) {
  if (!value) return {start: 0, end: size - 1, partial: false};
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) throw Error('Invalid byte range');
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (![start, end].every(Number.isSafeInteger) || start < 0 || start > end || start >= size) throw Error('Unsatisfiable byte range');
  return {start, end, partial: true};
}

function sendFile(req, res, file, type = 'video/mp4') {
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw Error('Not a file');
  let range;
  try { range = byteRange(req.headers.range, stat.size); }
  catch {
    res.writeHead(416, {'Content-Range': `bytes */${stat.size}`, 'Content-Length': 0});
    res.end();
    return;
  }
  const {start, end, partial} = range;
  res.writeHead(partial ? 206 : 200, {
    'Content-Type': type, 'Content-Length': stat.size ? end - start + 1 : 0,
    'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store',
    ...(partial ? {'Content-Range': `bytes ${start}-${end}/${stat.size}`} : {})
  });
  if (req.method === 'HEAD' || !stat.size) return res.end();
  const stream = fs.createReadStream(file, {start, end});
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

module.exports = {byteRange, sendFile};
