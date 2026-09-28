param([switch]$CheckOnly, [switch]$NoBrowser, [switch]$NoDialog, [switch]$IncludeConnector)

$ErrorActionPreference = 'Stop'
$studioRoot = $PSScriptRoot
$studioUrl = 'http://127.0.0.1:4173'
. (Join-Path $studioRoot 'restart-connector-service.ps1')

function Get-StudioWebListener {
    $owners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop |
        Where-Object { $_.LocalPort -eq 4173 } |
        Select-Object -ExpandProperty OwningProcess -Unique)
    if ($owners.Count -gt 1) { throw '4173 端口存在多个监听进程，未结束任何进程。' }
    if ($owners.Count) { return [int]$owners[0] }
    return $null
}

function Test-StudioWebPage {
    try {
        $page = Invoke-WebRequest -Uri $studioUrl -UseBasicParsing -TimeoutSec 2
        return $page.StatusCode -eq 200 -and $page.Content.Contains('AI MOVIE STUDIO')
    } catch { return $false }
}

function Get-StudioDeliveryModes {
    try {
        $result = Invoke-RestMethod -Uri "$studioUrl/api/timeline-export?projectId=service-restart-check" -TimeoutSec 2
        return @($result.deliveryModes)
    } catch { return @() }
}

function Get-StudioWebProcess {
    $ownerId = Get-StudioWebListener
    if ($null -eq $ownerId) { return $null }
    $candidate = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerId" -ErrorAction Stop
    if (-not $candidate -or $candidate.Name -ine 'node.exe') {
        throw '4173 端口被其他程序占用，未结束任何进程。'
    }
    $scriptMatch = [regex]::Match($candidate.CommandLine, '(?:^|\s)(?:"(?<entry>[^"]*local-server\.js)"|(?<entry>\S*local-server\.js))(?=\s|$)')
    if (-not $scriptMatch.Success) { throw '无法确认网页服务进程，未结束任何进程。' }
    $entry = $scriptMatch.Groups['entry'].Value
    if ([IO.Path]::IsPathRooted($entry)) {
        if ([IO.Path]::GetFullPath($entry) -ine (Join-Path $studioRoot 'local-server.js')) {
            throw '4173 端口属于另一份工作室，未结束任何进程。'
        }
    } elseif ($entry -notin @('local-server.js', '.\local-server.js', './local-server.js') -or -not (Test-StudioWebPage)) {
        throw '无法确认4173端口属于本工作室，未结束任何进程。'
    }
    return $candidate
}

function Restart-StudioWebService {
    # Only this web listener is stopped. Never stop by process name or process tree.
    $nodePath = (Get-Command node -ErrorAction Stop).Source
    $entryPath = Join-Path $studioRoot 'local-server.js'
    if (-not (Test-Path -LiteralPath $entryPath)) { throw '工作室启动文件缺失。' }
    $previous = Get-StudioWebProcess
    if ($previous) {
        $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($previous.ProcessId)" -ErrorAction Stop |
            Where-Object { $_.Name -match '^(ffmpeg[^\\]*|python[^\\]*|node)\.exe$' })
        if ($children.Count) { throw '工作室正在处理媒体，请等当前处理完成后再重启。' }
        # Re-check ownership immediately before stopping, protecting against a changed listener.
        $current = Get-StudioWebProcess
        if (-not $current -or $current.ProcessId -ne $previous.ProcessId -or $current.CreationDate -ne $previous.CreationDate) {
            throw '网页服务刚发生变化，请重新点击按钮。'
        }
        Stop-Process -Id $previous.ProcessId -ErrorAction Stop
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            if ($null -eq (Get-StudioWebListener)) { break }
            Start-Sleep -Milliseconds 250
        }
        if ($null -ne (Get-StudioWebListener)) { throw '旧网页服务尚未释放端口，未重复启动。' }
    }
    $runtime = Join-Path $studioRoot '.runtime'
    New-Item -ItemType Directory -Path $runtime -Force | Out-Null
    $logBase = Join-Path $runtime ('server-restart-' + (Get-Date -Format 'yyyyMMdd-HHmmss-ffff'))
    $previousPort = $env:PORT
    try {
        $env:PORT = '4173'
        $started = Start-Process -FilePath $nodePath -ArgumentList ('"' + $entryPath + '"') -WorkingDirectory $studioRoot -WindowStyle Hidden -RedirectStandardOutput "$logBase.stdout.log" -RedirectStandardError "$logBase.stderr.log" -PassThru
    } finally { $env:PORT = $previousPort }
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        if ($started.HasExited) { throw "网页服务启动失败。日志：$logBase.stderr.log" }
        if ((Get-StudioWebListener) -eq $started.Id -and (Test-StudioWebPage)) {
            $modes = @(Get-StudioDeliveryModes)
            if ($modes -notcontains 'master_and_review') { throw "网页已启动，但新版双文件导出未确认。日志：$logBase.stderr.log" }
            return [pscustomobject]@{ ok = $true; oldPid = $previous.ProcessId; newPid = $started.Id; deliveryModes = $modes; log = "$logBase.stdout.log" }
        }
        Start-Sleep -Milliseconds 300
    }
    throw "网页服务未在预期时间内就绪。日志：$logBase.stderr.log"
}

function Show-StudioRestartMessage($Text, [switch]$Failed) {
    if ($NoDialog) { return }
    Add-Type -AssemblyName System.Windows.Forms
    $icon = if ($Failed) { [System.Windows.Forms.MessageBoxIcon]::Error } else { [System.Windows.Forms.MessageBoxIcon]::Information }
    [System.Windows.Forms.MessageBox]::Show($Text, 'AI MOVIE STUDIO', [System.Windows.Forms.MessageBoxButtons]::OK, $icon) | Out-Null
}

# Dot-sourcing loads functions for isolated tests without starting or stopping anything.
if ($MyInvocation.InvocationName -ne '.') {
    $mutex = $null
    $held = $false
    try {
        if ($CheckOnly) {
            $existing = Get-StudioWebProcess
            if ($IncludeConnector) { Get-StudioConnectorProcess | Select-Object ProcessId, CreationDate; Assert-StudioRenderingIdle }
            [pscustomobject]@{ pid = $existing.ProcessId; startedAt = $existing.CreationDate; deliveryModes = @(Get-StudioDeliveryModes); changesMade = $false } | ConvertTo-Json -Depth 4
        } else {
            $mutex = New-Object System.Threading.Mutex($false, 'Local\AI_MOVIE_STUDIO_WebRestart_4173')
            $held = $mutex.WaitOne(0)
            if (-not $held) { throw '网页服务正在重启，请等待前一次操作完成。' }
            if ($IncludeConnector) { Restart-StudioConnectorService | ConvertTo-Json -Depth 4 }
            $result = Restart-StudioWebService
            if ($IncludeConnector) {
                $performance = Invoke-RestMethod -Uri "$studioUrl/api/performance-audio" -TimeoutSec 5
                if ($performance.version -ne 1 -or -not $performance.connectorReady) { throw '服务已启动，但配音生成链路尚未确认，请保留日志。' }
            }
            $result | ConvertTo-Json -Depth 4
            if (-not $NoBrowser) {
                try { Start-Process $studioUrl } catch { } # Browser failure must not turn a successful restart into a failed restart.
            }
            if ($IncludeConnector) { Show-StudioRestartMessage "网页与连接服务已重启，配音生成链路已启用。`n`nH3未重启，没有自动提交生成任务。原页面如有未保存编辑，请先保存再刷新。" }
            else { Show-StudioRestartMessage "网页服务已重启，新版双文件导出已启用。`n`nH3和Connector未重启。原页面如有未保存的编辑，请先保存再刷新。" }
        }
    } catch {
        Show-StudioRestartMessage $_.Exception.Message -Failed
        Write-Error $_.Exception.Message
        exit 1
    } finally {
        if ($held) { $mutex.ReleaseMutex() }
        if ($mutex) { $mutex.Dispose() }
    }
}
