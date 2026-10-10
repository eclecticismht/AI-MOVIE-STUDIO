'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const E=require('./timeline-export-api');
const ff=process.env.FFMPEG_PATH||'C:\\AI\\Comfy UI\\ComfyUI\\.venv\\Lib\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe';
test('installed FFmpeg encodes and reads exact16:9 SAR for854x480, not a rounded1:1 value',t=>{
 if(!fs.existsSync(ff)){t.skip('Installed local FFmpeg is unavailable in this environment; no download');return;}
 const dir=path.join(__dirname,'.runtime','480p-encoding-tests',String(Date.now())+'-'+process.pid);fs.mkdirSync(dir,{recursive:true});const out=path.join(dir,'rational-sar.mp4');
 const enc=cp.spawnSync(ff,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=864x480:r=24','-vf',E.intermediateFilter(E.outputSettings('854x480'),'crop')+','+E.outputScaleFilter('854x480'),'-frames:v','2','-an','-c:v','libx264','-pix_fmt','yuv420p',out],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(enc.status,0,enc.stderr);
 const dec=cp.spawnSync(ff,['-hide_banner','-i',out,'-frames:v','1','-f','null','-'],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(dec.status,0,dec.stderr);assert.match(dec.stderr,/854x480 \[SAR 1280:1281 DAR 16:9\]/);fs.writeFileSync(path.join(dir,'decode.txt'),dec.stderr);
});
