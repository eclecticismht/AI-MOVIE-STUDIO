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

function connectorRun(change=''){
 return run(`
 $script:connectorOwner=22002; $script:queueBusy=$false; $script:filmBusy=$false; $script:ready=$true
 function Get-NetTCPConnection { if($script:connectorOwner){[pscustomobject]@{LocalPort=8080;OwningProcess=$script:connectorOwner}}; [pscustomobject]@{LocalPort=4173;OwningProcess=12001}; [pscustomobject]@{LocalPort=8188;OwningProcess=44004} }
 function Get-CimInstance { param($ClassName,$Filter); if($Filter -like 'ParentProcessId=*'){return @()}; [pscustomobject]@{ProcessId=$script:connectorOwner;Name=$script:processName;CommandLine='node local-connector.js';CreationDate=[datetime]'2026-01-01'} }
 function Invoke-RestMethod {param($Uri)
  if($Uri.EndsWith('/queue')){return [pscustomobject]@{queue_running=@(if($script:queueBusy){,@(0,'task')});queue_pending=@()}}
  if($Uri.EndsWith('/api/film')){return [pscustomobject]@{runs=@(if($script:filmBusy){[pscustomobject]@{status='rendering'}})}}
  [pscustomobject]@{ok=$true;connector='AI MOVIE STUDIO Local Connector';performanceAudioVersion=if($script:ready){1}else{0}}
 }
 function Stop-Process { param($Id);$script:stopped+=@($Id);$script:connectorOwner=$null }
 function Start-Process { param($FilePath,$ArgumentList,$WorkingDirectory,$WindowStyle,$RedirectStandardOutput,$RedirectStandardError,[switch]$PassThru);$script:launched+=@([pscustomobject]@{argument=$ArgumentList;window=$WindowStyle});$script:connectorOwner=55005;[pscustomobject]@{Id=55005;HasExited=$false} }
 ${change}
 $answer=Restart-StudioConnectorService
 `);
}
test('Connector activation stops only its verified process and confirms audio capability',windows,()=>{
 const r=connectorRun();assert.equal(r.error,null);assert.deepEqual(r.stopped,[22002]);assert.equal(r.result.newPid,55005);assert.equal(r.launched[0].window,'Hidden');assert.equal(r.launched[0].argument,'"'+path.join(__dirname,'local-connector.js')+'"');
});
test('Connector activation refuses active GPU work, active films and foreign processes',windows,()=>{
 for(const change of ['$script:queueBusy=$true','$script:filmBusy=$true',"$script:processName='python.exe'"]){const r=connectorRun(change);assert.ok(r.error);assert.deepEqual(r.stopped,[]);assert.deepEqual(r.launched,[])}
});
test('Connector activation never reports success with the old audio capability',windows,()=>{
 const r=connectorRun('$script:ready=$false');assert.ok(r.error);assert.equal(r.result,null);
});

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
