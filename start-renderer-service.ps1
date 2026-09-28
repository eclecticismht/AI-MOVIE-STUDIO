param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
function Test-RendererReady {
    try { return $null -ne (Invoke-RestMethod 'http://127.0.0.1:8188/system_stats' -TimeoutSec 3).system } catch { return $false }
}
if (Test-RendererReady) { exit 0 }
if (Get-NetTCPConnection -State Listen -LocalPort 8188 -ErrorAction SilentlyContinue) { throw '渲染器端口已占用，请等待现有服务就绪。没有重复启动。' }
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'ComfyUI H3.lnk'
if (-not (Test-Path -LiteralPath $shortcutPath)) { throw '尚未配置本机 H3 启动入口，请先启动渲染器。' }
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
if ([IO.Path]::GetFileName($shortcut.TargetPath) -notin @('python.exe','pythonw.exe') -or $shortcut.Arguments -notmatch '^main\.py --listen 127\.0\.0\.1 --port 8188$' -or -not (Test-Path -LiteralPath (Join-Path $shortcut.WorkingDirectory 'main.py'))) { throw 'H3启动入口与已支持的本地配置不同，请检查配置。' }
$runtime = Join-Path $PSScriptRoot '.runtime'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
$log = Join-Path $runtime ('renderer-start-' + (Get-Date -Format 'yyyyMMdd-HHmmss-ffff'))
$started = Start-Process -FilePath $shortcut.TargetPath -ArgumentList $shortcut.Arguments -WorkingDirectory $shortcut.WorkingDirectory -WindowStyle Hidden -RedirectStandardOutput "$log.stdout.log" -RedirectStandardError "$log.stderr.log" -PassThru
for ($attempt = 0; $attempt -lt 120; $attempt++) {
    if (Test-RendererReady) { exit 0 }
    if ($started.HasExited) { throw "渲染器启动失败，请查看 $log.stderr.log" }
    Start-Sleep -Seconds 1
}
throw '渲染器仍在启动，请稍后检查连接状态；没有强制结束进程。'
