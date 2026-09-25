const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const {sendFile} = require('./media-response');

test('media HTTP responses deliver the requested bytes, including seeks, suffixes and HEAD', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ams-media-'));
  const file = path.join(root, 'sample.mp4'), bytes = Buffer.from(Array.from({length: 4096}, (_, i) => (i * 17 + Math.floor(i / 256)) % 256));
  fs.writeFileSync(file, bytes);
  const server = http.createServer((req, res) => sendFile(req, res, file));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.unlinkSync(file); fs.rmdirSync(root); });
  const url = `http://127.0.0.1:${server.address().port}`;
  for (const [range, start, end] of [['bytes=1024-1039', 1024, 1039], ['bytes=-16', 4080, 4095], ['bytes=4080-', 4080, 4095]]) {
    const response = await fetch(url, {headers: {Range: range}});
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/4096`);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(start, end + 1));
  }
  const head = await fetch(url, {method: 'HEAD', headers: {Range: 'bytes=1024-1039'}});
  assert.equal(head.headers.get('content-length'), '16'); assert.equal((await head.arrayBuffer()).byteLength, 0);
  for (const range of ['bytes=4096-', 'bytes=-0', 'bytes=8-2', 'bytes=0-1,4-5', 'bytes=9007199254740993-']) {
    assert.equal((await fetch(url, {headers: {Range: range}})).status, 416);
  }
});
