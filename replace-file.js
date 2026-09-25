const fs = require('node:fs');
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// Windows readers or virus scanners can briefly deny an atomic replacement.
// Keep both the old file and the completed temporary file on permanent failure.
function replaceFileSync(temporary, target, io = fs, wait = sleep) {
  const delays = [25, 50, 100, 200, 400];
  for (let attempt = 0; ; attempt++) {
    try { io.renameSync(temporary, target); return; }
    catch (error) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt === delays.length) throw error;
      wait(delays[attempt]);
    }
  }
}
module.exports = { replaceFileSync };
