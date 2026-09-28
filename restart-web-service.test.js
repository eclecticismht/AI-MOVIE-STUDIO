const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

const script=path.join(__dirname,'restart-web-service.ps1').replace(/'/g,"''");
function run(body){
 const source=`$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
. '${script}'
$script:stopped=@(); $script:launched=@(); $script:owner=12001
$script:processName='node.exe'; $script:command='"C:\\Program Files\\nodejs\\node.exe" local-server.js'
$script:children=@(); $script:pageHealthy=$true; $script:bundleReady=$true; $script:stuck=$false; $script:exited=$false
function Get-NetTCPConnection { if($script:owner){[pscustomobject]@{LocalPort=4173;OwningProcess=$script:owner}}; [pscustomobject]@{LocalPort=8080;OwningProcess=22002} }
function Get-CimInstance { param($ClassName,$Filter)
 if($Filter -like 'ParentProcessId=*'){return $script:children}
 return [pscustomobject]@{ProcessId=$script:owner;Name=$script:processName;CommandLine=$script:command;CreationDate=[datetime]'2026-01-01'}
}
function Invoke-WebRequest { if(-not $script:pageHealthy){throw 'offline'}; [pscustomobject]@{StatusCode=200;Content='AI MOVIE STUDIO'} }
function Invoke-RestMethod { [pscustomobject]@{deliveryModes=if($script:bundleReady){@('review','master_and_review')}else{@('review')}} }
function Get-Command { [pscustomobject]@{Source='C:\\Program Files\\nodejs\\node.exe'} }
function New-Item { }
function Start-Sleep { }
function Stop-Process { param($Id); $script:stopped+=@($Id); if(-not $script:stuck){$script:owner=$null} }
function Start-Process { param($FilePath,$ArgumentList,$WorkingDirectory,$WindowStyle,$RedirectStandardOutput,$RedirectStandardError,[switch]$PassThru)
 $script:launched+=@([pscustomobject]@{file=$FilePath;argument=$ArgumentList;directory=$WorkingDirectory;window=$WindowStyle})
 $script:owner=33003; [pscustomobject]@{Id=33003;HasExited=$script:exited}
}
$answer=$null; $problem=$null
try { ${body} } catch { $problem=$_.Exception.Message }
[pscustomobject]@{result=$answer;error=$problem;stopped=@($script:stopped);launched=@($script:launched)} | ConvertTo-Json -Depth 6 -Compress
`;
 return JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(source,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,timeout:20000}));
}
const windows={skip:process.platform!=='win32'};

test('web restart stops only the verified web owner and confirms the new backend',windows,()=>{
 const r=run('$answer=Restart-StudioWebService');
 assert.equal(r.error,null);assert.deepEqual(r.stopped,[12001]);assert.equal(r.launched.length,1);
 assert.equal(r.launched[0].window,'Hidden');assert.equal(r.launched[0].argument,'"'+path.join(__dirname,'local-server.js')+'"');
 assert.equal(r.result.newPid,33003);assert.ok(r.result.deliveryModes.includes('master_and_review'));
});
test('restart refuses a foreign process or a different checkout without stopping it',windows,()=>{
 for(const change of ["$script:processName='python.exe'",`$script:command='node "C:\\another-checkout\\local-server.js"'`,"$script:pageHealthy=$false"]){
  const r=run(change+'; $answer=Restart-StudioWebService');
  assert.ok(r.error);assert.deepEqual(r.stopped,[]);assert.deepEqual(r.launched,[]);
 }
});
test('restart refuses to interrupt active media conversion or a changed listener',windows,()=>{
 const busy=run("$script:children=@([pscustomobject]@{Name='ffmpeg-win-x86_64-v7.1.exe';ProcessId=40004}); $answer=Restart-StudioWebService");
 assert.ok(busy.error);assert.deepEqual(busy.stopped,[]);assert.deepEqual(busy.launched,[]);
 const changed=run("$script:reads=0; function Get-StudioWebProcess {$script:reads++; [pscustomobject]@{ProcessId=12000+$script:reads;CreationDate=[datetime]'2026-01-01'}}; $answer=Restart-StudioWebService");
 assert.ok(changed.error);assert.deepEqual(changed.stopped,[]);assert.deepEqual(changed.launched,[]);
});
test('an occupied port is never followed by a duplicate server launch',windows,()=>{
 const r=run('$script:stuck=$true; $answer=Restart-StudioWebService');
 assert.ok(r.error);assert.deepEqual(r.stopped,[12001]);assert.deepEqual(r.launched,[]);
});
test('missing service starts without killing anything, failures do not report success',windows,()=>{
 const absent=run('$script:owner=$null; $answer=Restart-StudioWebService');
 assert.equal(absent.error,null);assert.deepEqual(absent.stopped,[]);assert.equal(absent.launched.length,1);
 for(const change of ['$script:exited=$true','$script:bundleReady=$false']){
  const failed=run(change+'; $answer=Restart-StudioWebService');
  assert.ok(failed.error);assert.equal(failed.result,null);
 }
});
