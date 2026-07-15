# 볼스위칭 봇 실행기 (Windows) — .env 로드 → 봇 실행 → trader.log에 기록
Set-Location $PSScriptRoot
if (-not (Test-Path ".env")) {
    Write-Host ".env 파일이 없습니다. copy .env.example .env 후 키를 채우세요." -ForegroundColor Red
    exit 1
}
Get-Content .env | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]*)=(.*)$') {
        [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim())
    }
}
$env:PYTHONIOENCODING = "utf-8"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$log = Join-Path $PSScriptRoot "trader.log"
"`n[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] ----- 실행 -----" | Out-File -Append -Encoding utf8 $log
python run_trader.py 2>&1 | Tee-Object -FilePath $log -Append
