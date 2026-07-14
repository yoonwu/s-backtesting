# 볼스위칭 봇 실행기 (Windows) — .env를 읽어 환경변수로 만들고 봇 실행
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
python run_trader.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "봇 실행 중 오류 발생 (위 메시지 확인)" -ForegroundColor Red
}
