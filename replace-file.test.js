const {test} = require('node:test');
const assert = require('node:assert/strict');
const {replaceFileSync} = require('./replace-file');

test('temporary Windows file locks do not lose the previous queue or fail a completed replacement', () => {
  const files = new Map([['queue', 'old'], ['queue.tmp', 'new']]), waits = [];
  let calls = 0;
  replaceFileSync('queue.tmp', 'queue', {renameSync(from, to) {
    assert.equal(files.get(to), 'old');
    if (++calls < 3) throw Object.assign(Error('busy'), {code: 'EPERM'});
    files.set(to, files.get(from)); files.delete(from);
  }}, delay => waits.push(delay));
  assert.equal(files.get('queue'), 'new');
  assert.equal(files.has('queue.tmp'), false);
  assert.deepEqual(waits, [25, 50]);
});

test('permanent replacement errors remain visible with a bounded retry budget', () => {
  for (const code of ['EACCES', 'EBUSY', 'ENOSPC', 'ENOENT']) {
    let calls = 0; const waits = [], error = Object.assign(Error(code), {code});
    assert.throws(() => replaceFileSync('queue.tmp', 'queue', {renameSync() {calls++; throw error;}}, ms => waits.push(ms)), e => e === error);
    assert.equal(calls, ['EACCES', 'EBUSY'].includes(code) ? 6 : 1);
    assert.ok(waits.reduce((sum, ms) => sum + ms, 0) < 1000);
  }
});
