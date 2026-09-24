param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$node = (Get-Command node -ErrorAction Stop).Source
$runtime = Join-Path $PSScriptRoot '.runtime'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null

function Test-StudioService($Url, $Marker) {
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200 -and $response.Content.Contains($Marker)
    } catch { return $false }
}

foreach ($service in @(
    @{ Name = 'server'; Script = 'local-server.js'; Url = 'http://127.0.0.1:4173'; Marker = 'AI MOVIE STUDIO' },
    @{ Name = 'connector'; Script = 'local-connector.js'; Url = 'http://127.0.0.1:8080/health'; Marker = 'AI MOVIE STUDIO Local Connector' }
)) {
    if (Test-StudioService $service.Url $service.Marker) { continue }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-ffff'
    $log = Join-Path $runtime "$($service.Name)-$stamp"
    $process = Start-Process -FilePath $node -ArgumentList $service.Script -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput "$log.stdout.log" -RedirectStandardError "$log.stderr.log" -PassThru
    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        if (Test-StudioService $service.Url $service.Marker) { $ready = $true; break }
        if ($process.HasExited) { break }
        Start-Sleep -Milliseconds 300
    }
    if (-not $ready) { throw "Could not start $($service.Name). See $log.stderr.log" }
}
Write-Host 'AI MOVIE STUDIO: http://127.0.0.1:4173 (services run in the background)'
if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:4173' }
