# 競艇データ自動取得スクリプト

$scriptDir = $PSScriptRoot
$logFile   = Join-Path $scriptDir "fetch_log.txt"

$today    = (Get-Date).ToString("yyyyMMdd")
$tomorrow = (Get-Date).AddDays(1).ToString("yyyyMMdd")

# ログ書き込み関数
function Write-Log($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Add-Content -Path $logFile -Value $line -Encoding UTF8
    Write-Host $line
}

Write-Log "===== START ====="
Write-Log "Target: $today - $tomorrow"

Set-Location $scriptDir

try {
    $result = & python fetch_from_openapi.py $today $tomorrow 2>&1
    $result | ForEach-Object { Write-Log $_ }
    Write-Log "===== OK ====="
} catch {
    Write-Log "ERROR: $_"
    Write-Log "===== FAILED ====="
}
