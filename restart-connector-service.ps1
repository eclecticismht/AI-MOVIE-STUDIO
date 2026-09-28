# Loaded by the desktop restart button. Defining these functions never stops a service.
function Get-StudioConnectorListener {
    $owners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop |
        Where-Object { $_.LocalPort -eq 8080 } | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($owners.Count -gt 1) { throw '8080端口存在多个进程，未重启连接服务。' }
    if ($owners.Count) { return [int]$owners[0] }
    return $null
}
function Get-StudioConnectorProcess {
    $ownerId = Get-StudioConnectorListener
    if ($null -eq $ownerId) { return $null }
    $candidate = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerId" -ErrorAction Stop
    if (-not $candidate -or $candidate.Name -ine 'node.exe') { throw '8080端口属于其他程序，未结束任何进程。' }
    $match = [regex]::Match($candidate.CommandLine, '(?:^|\s)(?:"(?<entry>[^"]*local-connector\.js)"|(?<entry>\S*local-connector\.js))(?=\s|$)')
    if (-not $match.Success) { throw '无法确认本地连接服务，未结束任何进程。' }
    $entry = $match.Groups['entry'].Value
    if ([IO.Path]::IsPathRooted($entry)) {
        if ([IO.Path]::GetFullPath($entry) -ine (Join-Path $studioRoot 'local-connector.js')) { throw '8080属于另一份工作室，未结束任何进程。' }
    } elseif ($entry -notin @('local-connector.js', '.\local-connector.js', './local-connector.js')) { throw '连接服务路径无法确认。' }
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/health' -TimeoutSec 5
    if (-not $health.ok -or $health.connector -ne 'AI MOVIE STUDIO Local Connector') { throw '连接服务身份未确认，未重启。' }
    return $candidate
}
function Assert-StudioRenderingIdle {
    $queue = Invoke-RestMethod -Uri 'http://127.0.0.1:8188/queue' -TimeoutSec 5
    if ($null -eq $queue.queue_running -or $null -eq $queue.queue_pending) { throw '无法确认H3队列，未重启。' }
    if (@($queue.queue_running).Count -or @($queue.queue_pending).Count) { throw 'H3正在生成或等待生成，请完成当前任务后再重启。' }
    $films = Invoke-RestMethod -Uri 'http://127.0.0.1:4173/api/film' -TimeoutSec 5
    if ($null -eq $films.runs) { throw '无法确认成片任务状态，未重启。' }
    if (@($films.runs | Where-Object { $_.status -in @('pending','rendering','assembling') }).Count) { throw '工作室有进行中的成片任务，请先暂停或完成。' }
}
function Restart-StudioConnectorService {
    $nodePath = (Get-Command node -ErrorAction Stop).Source
    $entryPath = Join-Path $studioRoot 'local-connector.js'
    if (-not (Test-Path -LiteralPath $entryPath)) { throw '连接服务启动文件缺失。' }
    $previous = Get-StudioConnectorProcess
    Assert-StudioRenderingIdle
    if ($previous) {
        $workers = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($previous.ProcessId)" -ErrorAction Stop |
            Where-Object { $_.Name -notin @('conhost.exe','OpenConsole.exe') })
        if ($workers.Count) { throw '连接服务有子任务，请完成后再重启。' }
        $current = Get-StudioConnectorProcess
        if (-not $current -or $current.ProcessId -ne $previous.ProcessId -or $current.CreationDate -ne $previous.CreationDate) { throw '连接服务发生变化，请重新点击按钮。' }
        Assert-StudioRenderingIdle
        Stop-Process -Id $previous.ProcessId -ErrorAction Stop
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            if ($null -eq (Get-StudioConnectorListener)) { break }
            Start-Sleep -Milliseconds 250
        }
        if ($null -ne (Get-StudioConnectorListener)) { throw '连接服务端口尚未释放，未重复启动。' }
    }
    $runtime = Join-Path $studioRoot '.runtime'
    New-Item -ItemType Directory -Path $runtime -Force | Out-Null
    $logBase = Join-Path $runtime ('connector-restart-' + (Get-Date -Format 'yyyyMMdd-HHmmss-ffff'))
    $previousConnectorPort = $env:CONNECTOR_PORT
    $previousComfyUrl = $env:COMFY_URL
    try {
        $env:CONNECTOR_PORT = '8080'
        $env:COMFY_URL = 'http://127.0.0.1:8188'
        $started = Start-Process -FilePath $nodePath -ArgumentList ('"' + $entryPath + '"') -WorkingDirectory $studioRoot -WindowStyle Hidden -RedirectStandardOutput "$logBase.stdout.log" -RedirectStandardError "$logBase.stderr.log" -PassThru
    } finally { $env:CONNECTOR_PORT = $previousConnectorPort; $env:COMFY_URL = $previousComfyUrl }
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        if ($started.HasExited) { throw "连接服务启动失败。日志：$logBase.stderr.log" }
        if ((Get-StudioConnectorListener) -eq $started.Id) {
            try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/health' -TimeoutSec 2 } catch { $health = $null }
            if ($health.ok -and $health.performanceAudioVersion -eq 1) { return [pscustomobject]@{ ok = $true; oldPid = $previous.ProcessId; newPid = $started.Id; performanceAudioVersion = 1 } }
        }
        Start-Sleep -Milliseconds 300
    }
    throw "新版配音功能尚未确认。日志：$logBase.stderr.log"
}
